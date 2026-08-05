// Minimal Resend client over the HTTP API (no dependency). Fail-soft: a missing
// key or a provider error returns { sent: false, reason } rather than throwing,
// so a report send can never take down the job that produced it.

export interface SendResult {
  sent: boolean;
  id?: string;
  reason?: string;
}

export async function sendEmail(
  msg: { to: string; from: string; subject: string; html: string; text?: string },
  deps: { apiKey?: string; fetchImpl?: typeof fetch },
): Promise<SendResult> {
  if (!deps.apiKey) return { sent: false, reason: "no RESEND_API_KEY configured" };
  const fetchImpl = deps.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${deps.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: msg.from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { sent: false, reason: `resend ${res.status}: ${body.slice(0, 200)}` };
    }
    const j = (await res.json().catch(() => ({}))) as { id?: string };
    return { sent: true, id: j.id };
  } catch (e) {
    return { sent: false, reason: String((e as Error)?.message ?? e) };
  }
}
