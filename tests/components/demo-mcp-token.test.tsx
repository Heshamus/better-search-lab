// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DemoMcpToken } from "@/components/demo-mcp-token";
import { DEMO_MCP_TOKEN } from "@/lib/demo/public";
import { MCP_PACKAGE_URL } from "@/lib/release";

afterEach(cleanup);

describe("DemoMcpToken", () => {
  it("shows the fixed demo token and the npx command with the release download URL", () => {
    render(<DemoMcpToken />);
    expect(screen.getByText(DEMO_MCP_TOKEN)).toBeInTheDocument();
    expect(screen.getByText(`npx -y ${MCP_PACKAGE_URL}`)).toBeInTheDocument();
  });
});
