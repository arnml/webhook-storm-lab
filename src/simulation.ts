/** Discrete time model: retries share the same limited downstream capacity as new work. */
export function simulate(mode: "immediate" | "buffered", arrivals = 50, capacity = 5, seconds = 10) {
  let pending = arrivals, attempts = 0, completed = 0;
  const timeline: { second: number; attempts: number; completed: number; pending: number }[] = [];
  for (let second = 1; second <= seconds && pending > 0; second++) {
    const attempted = mode === "immediate" ? pending : Math.min(pending, capacity);
    const succeeded = Math.min(attempted, capacity);
    attempts += attempted; completed += succeeded; pending -= succeeded;
    timeline.push({ second, attempts: attempted, completed: succeeded, pending });
  }
  return { attempts, completed, pending, timeline };
}
