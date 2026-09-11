import { db } from "@/db/client";
import { requireAdminUser } from "@/lib/auth/session";
import { listApiTokens } from "@/lib/api-tokens";
import { McpTokenManager } from "@/components/mcp-token-manager";
import { isDemoMode } from "@/lib/demo/mode";
import { DemoMcpToken } from "@/components/demo-mcp-token";

export const dynamic = "force-dynamic";

export default async function McpPage() {
  await requireAdminUser();
  const demo = isDemoMode();
  const tokens = demo ? [] : await listApiTokens(db);
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-neutral-900">MCP access tokens</h2>
        <p className="text-xs text-neutral-500">Bearer tokens for the read-only MCP server. A token reads every project, so only admins mint them.</p>
      </div>
      {demo ? <DemoMcpToken /> : <McpTokenManager tokens={tokens} />}
    </section>
  );
}
