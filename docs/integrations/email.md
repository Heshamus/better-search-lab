# Email

Sends the weekly AI-visibility report and the daily Reddit digest. Choose **Resend** (API key) or **SMTP** (host, port, user, password, implicit TLS on or off), set the **From** address and the **Report recipient**, and **Test** — it sends a real message to you.

Environment overrides: `EMAIL_PROVIDER`, `RESEND_API_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`, `EMAIL_FROM` (legacy `REPORT_EMAIL_FROM`), `REPORT_EMAIL_TO`. Without a recipient the reports are skipped and the worker says so at startup.
