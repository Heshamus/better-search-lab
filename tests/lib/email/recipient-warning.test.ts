import { describe, it, expect } from "vitest";
import { buildConfig } from "@/lib/config/resolve";
import { recipientWarning } from "@/lib/email/recipient-warning";

const cfg = (env: Record<string, string>) => buildConfig({ stored: [], env });
const CONFIGURED = { RESEND_API_KEY: "k", EMAIL_FROM: "reports@example.com" };

describe("recipientWarning", () => {
  it("warns when email works but nothing would ever be delivered", () => {
    const msg = recipientWarning(cfg(CONFIGURED));
    expect(msg).not.toBeNull();
    expect(msg).toMatch(/REPORT_EMAIL_TO/);
    expect(msg).toMatch(/Settings → Integrations/);
    expect(msg).toMatch(/skipped/);
    expect(msg!.split("\n")).toHaveLength(1);
  });

  it("says nothing once a recipient is set", () => {
    expect(recipientWarning(cfg({ ...CONFIGURED, REPORT_EMAIL_TO: "me@example.com" }))).toBeNull();
  });

  it("says nothing when email is not configured at all — that is a different problem", () => {
    expect(recipientWarning(cfg({}))).toBeNull();
    expect(recipientWarning(cfg({ REPORT_EMAIL_TO: "me@example.com" }))).toBeNull();
  });

  it("never leaks the credential that made email configured", () => {
    const msg = recipientWarning(cfg({ ...CONFIGURED, RESEND_API_KEY: "sk-super-secret" }));
    expect(msg).not.toMatch(/sk-super-secret/);
  });
});
