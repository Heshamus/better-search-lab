import { DEMO_MCP_TOKEN } from "@/lib/demo/public";
import { MCP_PACKAGE_URL } from "@/lib/release";

/** MCP settings page in demo mode (spec §13): the one fixed, documented, read-only token — no generate/revoke, nothing to leak. */
export function DemoMcpToken() {
  return (
    <div className="panel flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-1">
        <span className="eyebrow">Demo token</span>
        <code className="select-all break-all font-mono text-sm text-neutral-100">{DEMO_MCP_TOKEN}</code>
      </div>
      <p className="text-xs text-neutral-500">
        Read-only; the demo data is synthetic. Run the MCP server with <code className="font-mono text-neutral-300">{`npx -y ${MCP_PACKAGE_URL}`}</code> and BSL_URL set to this demo.
      </p>
    </div>
  );
}
