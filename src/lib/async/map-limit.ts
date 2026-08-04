/**
 * Run `fn` over `items` with at most `limit` in flight at once, preserving input
 * order in the results. Used to parallelize independent external calls (e.g. a
 * SERP lookup per tracked keyword) that were previously awaited one-at-a-time and
 * made jobs run for minutes — while capping concurrency so we don't stampede the
 * provider or the connection pool.
 */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}
