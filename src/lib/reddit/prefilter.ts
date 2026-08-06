import type { RedditPost } from "./apify";

export interface PrefilterOpts {
  now: number;
  maxAgeHours?: number;
  maxComments?: number;
  minChars?: number;
}

/**
 * Filter Reddit posts by freshness, saturation, and content criteria.
 * A post is kept if it is fresh AND (is a question OR has sufficient body text).
 *
 * @param posts Array of RedditPost objects
 * @param opts Filter options with current timestamp and optional thresholds
 * @returns Filtered array of RedditPost objects
 */
export function prefilterPosts(
  posts: RedditPost[],
  opts: PrefilterOpts
): RedditPost[] {
  const maxAge = (opts.maxAgeHours ?? 72) * 3600_000;
  const maxC = opts.maxComments ?? 40;
  const minChars = opts.minChars ?? 80;

  return posts.filter((p) => {
    const age = opts.now - Date.parse(p.createdAt);

    // Post must be fresh (valid date and within age window)
    if (!(age >= 0 && age <= maxAge)) return false;

    // Post must not be saturated with comments
    if ((p.numComments ?? 0) > maxC) return false;

    // Post must be a question (title ends with ?) OR have substantial body text
    const isQuestion = /\?\s*$/.test(p.title);
    const hasBody = p.body.trim().length >= minChars;

    return isQuestion || hasBody;
  });
}
