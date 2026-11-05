import { simulate } from "./simulation.js";
for (const mode of ["immediate", "buffered"] as const) {
  const result = simulate(mode);
  console.log(`\n${mode}: ${result.completed} completed, ${result.attempts} attempts, ${result.pending} pending`);
  console.table(result.timeline);
}
