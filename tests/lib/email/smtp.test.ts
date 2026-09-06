import { describe, it, expect, vi } from "vitest";
import { SmtpEmailSender } from "@/lib/email/smtp";

describe("SmtpEmailSender", () => {
  it("builds the transport from config and sends with the configured From by default", async () => {
    const sendMail = vi.fn(async () => ({ messageId: "<m1@example>" }));
    const factory = vi.fn(() => ({ sendMail }));
    const sender = new SmtpEmailSender({ host: "mail.example", port: 587, secure: false, user: "u", password: "p", from: "Lab <r@example.com>", transportFactory: factory });
    const out = await sender.send({ to: "a@example.com", subject: "Hi", html: "<p>hi</p>", text: "hi" });
    expect(out).toEqual({ sent: true, id: "<m1@example>" });
    expect(factory).toHaveBeenCalledWith({ host: "mail.example", port: 587, secure: false, auth: { user: "u", pass: "p" } });
    expect(sendMail).toHaveBeenCalledWith({ from: "Lab <r@example.com>", to: "a@example.com", subject: "Hi", html: "<p>hi</p>", text: "hi" });
  });

  it("omits auth for an unauthenticated relay and honors a per-message From", async () => {
    const sendMail = vi.fn(async () => ({ messageId: "x" }));
    const factory = vi.fn(() => ({ sendMail }));
    const sender = new SmtpEmailSender({ host: "relay", port: 25, secure: false, from: "r@example.com", transportFactory: factory });
    await sender.send({ to: "a@example.com", subject: "s", html: "h", from: "other@example.com" });
    expect((factory as any).mock.calls[0][0]).toEqual({ host: "relay", port: 25, secure: false, auth: undefined });
    expect((sendMail as any).mock.calls[0][0]).toMatchObject({ from: "other@example.com" });
  });

  it("fails soft with the transport's error message", async () => {
    const factory = () => ({ sendMail: vi.fn(async () => { throw new Error("535 auth failed"); }) });
    const sender = new SmtpEmailSender({ host: "h", port: 465, secure: true, from: "r@example.com", transportFactory: factory });
    const out = await sender.send({ to: "a@example.com", subject: "s", html: "h" });
    expect(out.sent).toBe(false);
    expect(out.reason).toMatch(/535/);
  });
});
