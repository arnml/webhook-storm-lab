# Webhook storm lab

A small AWS/TypeScript lab for discussing what happens when a burst of webhooks meets a slower downstream service. Inspired by [429s, webhook storms, and the wrong fix](https://newsletter.systemdesignclassroom.com/p/429s-webhook-storms-and-the-wrong-fix). The source article was unavailable during development; this is an independent illustration of the theme, not a reconstruction of its case study.

```text
Sender -> HTTP API -> verify signature -> SQS -> bounded Lambda worker -> downstream
                                             | retries                 (simulated)
                                             +-> dead-letter queue
```

The receiver returns 202 only after SQS accepts the event. Workers process at most two concurrent messages; failed messages become visible again after the visibility timeout and move to a dead-letter queue after five receives. Alarms track queue age and dead letters. This separates acceptance from processing, but a queue cannot create downstream capacity. If arrivals stay above capacity, backlog and latency grow. API throttling can still produce 429s; senders must retry with exponential backoff and jitter and respect Retry-After where available.

## Run locally

Requires Node.js 22+ and npm. No AWS account needed.

```sh
npm ci
npm test
npm run demo
```

The deterministic simulation assumes 50 events arrive at once, five downstream successes per second, and immediate retries once per second. The immediate strategy makes 275 attempts; buffering makes 50. This deliberately simple model is not a load test, and it does not model jitter, timeouts, or multiple senders.

## Deploy the optional lab

Requires Terraform >= 1.5, AWS credentials and permission to create the resources, and a unique project name per AWS account/region. This creates billable resources. Set a strong secret in your shell as `TF_VAR_webhook_secret`; do not commit it. For example, in PowerShell: `$env:TF_VAR_webhook_secret = 'replace-with-a-long-random-secret'`.

```sh
npm ci
npm run package
cd infra
terraform init
terraform validate
terraform plan
terraform apply
```

The TypeScript infrastructure generator writes `infra/generated.tf.json`, native Terraform JSON. Run `npm run package` again after any code or infrastructure changes before planning. Terraform stores the secret in state and Lambda environment configuration: use a protected, encrypted remote backend and a secret manager for real deployments. The default local state is for learning only. HashiCorp [deprecated CDK for Terraform](https://developer.hashicorp.com/terraform/cdktf) in 2025; generating native JSON keeps Terraform as the deployment engine without relying on the deprecated framework.

Get the URL with `terraform output -raw webhook_url`. Sign the **exact UTF-8 request body** using HMAC-SHA256 with the configured secret, and send `x-webhook-signature: sha256=<hex>`. Example from another shell (Node 22):

```sh
node -e 'const c=require("crypto"); const body=JSON.stringify({id:"evt-1",type:"order.created"}); const signature="sha256="+c.createHmac("sha256",process.env.TF_VAR_webhook_secret).update(body).digest("hex"); fetch(process.argv[1],{method:"POST",headers:{"content-type":"application/json","x-webhook-signature":signature},body}).then(async r=>console.log(r.status,await r.text()))' YOUR_WEBHOOK_URL
```

Send `type: "simulate.429"` to exercise retries and the DLQ; it intentionally fails every time. Inspect CloudWatch logs and the two alarms. Alarms do not have notification actions configured. Run `terraform destroy` from `infra` after the exercise, with the same secret and variables.

## Discussion and production gaps

- SQS standard queues are at-least-once and can reorder. **The worker does not deduplicate**: replace the log-only handler with a durable idempotent business operation keyed by provider and event ID. A separate check followed by a side effect is not atomic; use a transactional inbox/outbox or an idempotent downstream API.
- The example models a persistent 429 as a failed message, not a real HTTP integration. A real worker should distinguish transient from permanent errors, honor Retry-After, add jitter, set explicit timeouts, and coordinate a global rate limit. Reserved concurrency limits parallelism, not requests per second. SQS visibility timeout gives a fixed retry delay, not exponential backoff.
- Size the queue, concurrency, visibility timeout, retention, and DLQ policy to measured downstream capacity and recovery objectives. Monitor oldest-message age, queue depth, error rates, throttles and DLQ; define an owner and a safe redrive procedure.
- Authenticate each provider according to its protocol; include timestamp/replay protection and rotation. The simple shared-secret signature is illustrative and is not a specific vendor protocol. Limit request sizes and avoid logging secrets or sensitive payloads.
- This demo uses one shared IAM role and no production alert destination; split roles, configure log retention, encryption and notifications, and review least privilege before deployment. Terraform state and Lambda configuration contain the secret.
