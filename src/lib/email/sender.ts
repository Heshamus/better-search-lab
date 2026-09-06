// The one seam every email consumer depends on. Adapters: resend.ts, smtp.ts.
// Fail-soft by contract: send() resolves { sent: false, reason } on any failure
// and never throws, so a report can never take down the job that produced it.
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Defaults to the adapter's configured From. */
  from?: string;
}

export interface SendResult {
  sent: boolean;
  id?: string;
  reason?: string;
}

export interface EmailSender {
  send(msg: EmailMessage): Promise<SendResult>;
}
