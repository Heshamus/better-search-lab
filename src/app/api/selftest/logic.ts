import { findDomainRank, computeRankDelta } from "@/lib/core/rank";

export function runSelftest() {
  const items = [{ rankAbsolute: 12, rankGroup: 11, domain: "harperflow.io", url: "u", serpFeatures: [] }];
  const rank = findDomainRank(items, "harperflow.io");
  const delta = computeRankDelta(rank?.rankAbsolute ?? null, 15);
  const checks = { rankParsed: rank?.rankAbsolute === 12, deltaComputed: delta === 3 };
  return { ok: Object.values(checks).every(Boolean), checks };
}
