import nodemailer from "nodemailer";
import type { EmailMessage, EmailSender, SendResult } from "./sender";

export interface SmtpTransportOptions {
  host: string;
  port: number;
  secure: boolean;
  auth?: { user: string; pass: string };
}

export type SmtpTransportFactory = (opts: SmtpTransportOptions) => {
  sendMail(mail: Record<string, unknown>): Promise<{ messageId?: string }>;
};

const defaultFactory: SmtpTransportFactory = (opts) => nodemailer.createTransport(opts);

/** SMTP via nodemailer — what most self-hosters already have. */
export class SmtpEmailSender implements EmailSender {
  private factory: SmtpTransportFactory;
  constructor(
    private cfg: { host: string; port: number; secure: boolean; user?: string; password?: string; from: string; transportFactory?: SmtpTransportFactory },
  ) {
    this.factory = cfg.transportFactory ?? defaultFactory;
  }

  async send(msg: EmailMessage): Promise<SendResult> {
    try {
      const transport = this.factory({
        host: this.cfg.host,
        port: this.cfg.port,
        secure: this.cfg.secure,
        auth: this.cfg.user ? { user: this.cfg.user, pass: this.cfg.password ?? "" } : undefined,
      });
      const info = await transport.sendMail({ from: msg.from ?? this.cfg.from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text });
      return { sent: true, id: info.messageId };
    } catch (e) {
      return { sent: false, reason: String((e as Error)?.message ?? e) };
    }
  }
}
