// Default import + destructure, as src/app/api/health/route.ts does: Next's
// bundler warns about named exports from JSON modules.
import pkg from "../../package.json";
import { REPO_URL } from "@/lib/demo/links";

const { version } = pkg;

/**
 * The MCP server ships as a tarball attached to every GitLab Release; `npx` runs
 * it straight from this URL. Both packages carry the app's version, so the app's
 * own version names the right file. Versioned on purpose: npx keeps whatever it
 * first fetched from a fixed URL, so a "latest" link would pin users to their
 * first download.
 */
export const MCP_PACKAGE_URL = `${REPO_URL}/-/releases/v${version}/downloads/better-search-lab-mcp.tgz`;
