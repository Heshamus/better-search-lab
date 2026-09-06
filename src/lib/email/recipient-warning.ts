import type { AppConfig } from "@/lib/config/app-config";

/**
 * Email configured, nobody to send to. Both scheduled report passes read
 * cfg.email.reportTo and skip silently when it is unset, so an operator who
 * connected Resend or SMTP and then never saw a report has no way to tell the
 * difference between "not due yet" and "will never send". Returns one line for
 * the worker to log at startup, or null when there is nothing to say — an
 * unconfigured email group is a different (and visible) problem.
 */
export function recipientWarning(cfg: AppConfig): string | null {
  if (!cfg.email.configured || cfg.email.reportTo) return null;
  return "Email is configured but no report recipient is set — set REPORT_EMAIL_TO or Settings → Integrations → Email → Report recipient; weekly AI-visibility reports and daily Reddit digests will be skipped.";
}
