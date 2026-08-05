import { describe, it, expect, vi } from "vitest";
import { sendEmail } from "@/lib/email/resend";

describe("sendEmail", () => {
  it("POSTs to the Resend API with Bearer auth and returns the id", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "eml_123" }), { status: 200 })) as unknown as typeof fetch;
    const out = await sendEmail(
      { to: "a@b.com", from: "x@harperflow.io", subject: "Hi", html: "<p>hi</p>", text: "hi" },
      { apiKey: "re_key", fetchImpl },
    );
    expect(out).toEqual({ sent: true, id: "eml_123" });
    const [url, init] = (fetchImpl as any).mock.calls[0];
    expect(String(url)).toBe("https://api.resend.com/emails");
    expect((init.headers as any).authorization).toBe("Bearer re_key");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ to: "a@b.com", from: "x@harperflow.io", subject: "Hi", html: "<p>hi</p>" });
  });

  it("fails soft (no throw) when the API key is absent", async () => {
    const out = await sendEmail({ to: "a@b.com", from: "x@h.io", subject: "s", html: "h" }, {});
    expect(out.sent).toBe(false);
    expect(out.reason).toMatch(/RESEND/);
  });

  it("returns the error reason on a non-OK response", async () => {
    const fetchImpl = vi.fn(async () => new Response("bad", { status: 422 })) as unknown as typeof fetch;
    const out = await sendEmail({ to: "a@b.com", from: "x@h.io", subject: "s", html: "h" }, { apiKey: "k", fetchImpl });
    expect(out.sent).toBe(false);
    expect(out.reason).toMatch(/422/);
  });
});
