import { describe, it, expect, vi } from "vitest";
import { sendEmail } from "@/lib/email/resend";

describe("sendEmail", () => {
  it("POSTs to the Resend API with Bearer auth and returns the id", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "eml_123" }), { status: 200 })) as unknown as typeof fetch;
    const out = await sendEmail(
      { to: "a@b.com", from: "x@example-site.com", subject: "Hi", html: "<p>hi</p>", text: "hi" },
      { apiKey: "re_key", fetchImpl },
    );
    expect(out).toEqual({ sent: true, id: "eml_123" });
    const [url, init] = (fetchImpl as any).mock.calls[0];
    expect(String(url)).toBe("https://api.resend.com/emails");
    expect((init.headers as any).authorization).toBe("Bearer re_key");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ to: "a@b.com", from: "x@example-site.com", subject: "Hi", html: "<p>hi</p>" });
  });

  it("fails soft (no throw) when the API key is absent", async () => {
    const out = await sendEmail({ to: "a@b.com", from: "x@h.io", subject: "s", html: "h" }, {});
    expect(out.sent).toBe(false);
    expect(out.reason).toMatch(/Resend/);
  });

  it("returns the error reason on a non-OK response", async () => {
    const fetchImpl = vi.fn(async () => new Response("bad", { status: 422 })) as unknown as typeof fetch;
    const out = await sendEmail({ to: "a@b.com", from: "x@h.io", subject: "s", html: "h" }, { apiKey: "k", fetchImpl });
    expect(out.sent).toBe(false);
    expect(out.reason).toMatch(/422/);
  });
});

import { ResendEmailSender } from "@/lib/email/resend";

describe("ResendEmailSender", () => {
  it("wraps sendEmail with the configured key and From", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "eml_9" }), { status: 200 })) as unknown as typeof fetch;
    const sender = new ResendEmailSender({ apiKey: "re_key", from: "Lab <r@example.com>", fetchImpl });
    const out = await sender.send({ to: "a@example.com", subject: "s", html: "h" });
    expect(out).toEqual({ sent: true, id: "eml_9" });
    const body = JSON.parse((fetchImpl as any).mock.calls[0][1].body);
    expect(body).toMatchObject({ from: "Lab <r@example.com>", to: "a@example.com" });
  });
});
