import { writeFileSync } from "node:fs";

// Terraform expressions stay as strings; Terraform resolves them when it plans.
const ref = (expression: string) => `\${${expression}}`;
const resource: Record<string, Record<string, unknown>> = {
  aws_sqs_queue: {
    dead: { name: "${var.project}-dead", message_retention_seconds: 1209600, sqs_managed_sse_enabled: true },
    work: { name: "${var.project}-work", visibility_timeout_seconds: 180, message_retention_seconds: 345600, sqs_managed_sse_enabled: true,
      redrive_policy: ref('jsonencode({ deadLetterTargetArn = aws_sqs_queue.dead.arn, maxReceiveCount = 5 })') }
  },
  aws_iam_role: { lambda: { name: "${var.project}-lambda", assume_role_policy: ref('jsonencode({Version="2012-10-17",Statement=[{Effect="Allow",Principal={Service="lambda.amazonaws.com"},Action="sts:AssumeRole"}]})') } },
  aws_iam_role_policy_attachment: { logs: { role: ref("aws_iam_role.lambda.name"), policy_arn: "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole" } },
  aws_iam_role_policy: { queue: { role: ref("aws_iam_role.lambda.id"), policy: ref('jsonencode({Version="2012-10-17",Statement=[{Effect="Allow",Action=["sqs:SendMessage","sqs:ReceiveMessage","sqs:DeleteMessage","sqs:GetQueueAttributes"],Resource=aws_sqs_queue.work.arn}]})') } },
  aws_lambda_function: {
    receiver: { function_name: "${var.project}-receiver", role: ref("aws_iam_role.lambda.arn"), runtime: "nodejs22.x", handler: "receiver.handler", filename: ref("data.archive_file.receiver.output_path"), source_code_hash: ref("data.archive_file.receiver.output_base64sha256"), timeout: 10, environment: { variables: { QUEUE_URL: ref("aws_sqs_queue.work.url"), WEBHOOK_SECRET: ref("var.webhook_secret") } } },
    worker: { function_name: "${var.project}-worker", role: ref("aws_iam_role.lambda.arn"), runtime: "nodejs22.x", handler: "worker.handler", filename: ref("data.archive_file.worker.output_path"), source_code_hash: ref("data.archive_file.worker.output_base64sha256"), timeout: 30, reserved_concurrent_executions: 2 }
  },
  aws_lambda_event_source_mapping: { worker: { depends_on: ["aws_iam_role_policy.queue"], event_source_arn: ref("aws_sqs_queue.work.arn"), function_name: ref("aws_lambda_function.worker.arn"), batch_size: 1, function_response_types: ["ReportBatchItemFailures"], scaling_config: { maximum_concurrency: 2 } } },
  aws_apigatewayv2_api: { webhook: { name: "${var.project}-webhook", protocol_type: "HTTP" } },
  aws_apigatewayv2_integration: { receiver: { api_id: ref("aws_apigatewayv2_api.webhook.id"), integration_type: "AWS_PROXY", integration_uri: ref("aws_lambda_function.receiver.invoke_arn"), payload_format_version: "2.0" } },
  aws_apigatewayv2_route: { webhook: { api_id: ref("aws_apigatewayv2_api.webhook.id"), route_key: "POST /webhooks", target: "integrations/${aws_apigatewayv2_integration.receiver.id}" } },
  aws_apigatewayv2_stage: { default: { api_id: ref("aws_apigatewayv2_api.webhook.id"), name: "$default", auto_deploy: true, default_route_settings: { throttling_burst_limit: 20, throttling_rate_limit: 10 } } },
  aws_lambda_permission: { api: { statement_id: "AllowApiGateway", action: "lambda:InvokeFunction", function_name: ref("aws_lambda_function.receiver.function_name"), principal: "apigateway.amazonaws.com", source_arn: "${aws_apigatewayv2_api.webhook.execution_arn}/*/*" } },
  aws_cloudwatch_metric_alarm: { dead: { alarm_name: "${var.project}-dead-letters", comparison_operator: "GreaterThanThreshold", evaluation_periods: 1, metric_name: "ApproximateNumberOfMessagesVisible", namespace: "AWS/SQS", period: 60, statistic: "Maximum", threshold: 0, dimensions: { QueueName: ref("aws_sqs_queue.dead.name") }, treat_missing_data: "notBreaching" },
    age: { alarm_name: "${var.project}-oldest-message", comparison_operator: "GreaterThanThreshold", evaluation_periods: 2, metric_name: "ApproximateAgeOfOldestMessage", namespace: "AWS/SQS", period: 60, statistic: "Maximum", threshold: 300, dimensions: { QueueName: ref("aws_sqs_queue.work.name") }, treat_missing_data: "notBreaching" } }
};
const config = {
  terraform: { required_version: ">= 1.5.0", required_providers: { aws: { source: "hashicorp/aws", version: "~> 5.0" }, archive: { source: "hashicorp/archive", version: "~> 2.0" } } },
  provider: { aws: { region: ref("var.aws_region") } },
  variable: { aws_region: { type: "string", default: "us-east-1" }, project: { type: "string", default: "webhook-storm-lab" }, webhook_secret: { type: "string", sensitive: true, nullable: false } },
  data: { archive_file: Object.fromEntries(["receiver", "worker"].map(name => [name, { type: "zip", source_file: `../dist/bundles/${name}.cjs`, output_path: `../dist/${name}.zip` }])) },
  resource,
  output: { webhook_url: { value: "${aws_apigatewayv2_api.webhook.api_endpoint}/webhooks" }, dead_letter_queue_url: { value: ref("aws_sqs_queue.dead.url") } }
};
writeFileSync("infra/generated.tf.json", JSON.stringify(config, null, 2) + "\n");
