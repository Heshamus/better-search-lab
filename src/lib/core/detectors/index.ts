import type { DetectorInput, Candidate } from "./types";
import { strikingDistance } from "./striking-distance";
import { decay } from "./decay";
import { momentum } from "./momentum";
import { gap } from "./gap";
import { serpFeature } from "./serp-feature";
import { cannibalization } from "./cannibalization";
import { detectCtrGap } from "./ctr-gap";
import { detectContentVsRanking } from "./content-vs-ranking";

export { strikingDistance } from "./striking-distance";
export { decay } from "./decay";
export { momentum } from "./momentum";
export { gap } from "./gap";
export { serpFeature } from "./serp-feature";
export { cannibalization } from "./cannibalization";
export { detectCtrGap } from "./ctr-gap";
export { detectContentVsRanking } from "./content-vs-ranking";

/** Every detector, concatenated into one candidate list. */
export function runDetectors(input: DetectorInput): Candidate[] {
  return [
    ...strikingDistance(input),
    ...decay(input),
    ...momentum(input),
    ...gap(input),
    ...serpFeature(input),
    ...cannibalization(input),
    ...detectCtrGap(input),
    ...detectContentVsRanking(input),
  ];
}
