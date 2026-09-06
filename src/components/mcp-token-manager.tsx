"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type GenerateState = "idle" | "busy" | "error";
type CopyState = "idle" | "done" | "error";

export interface McpTokenSummary {
  id: string;
  label: string | null;
  createdAt: string | Date;
  lastUsedAt: string | Date | null;
}

const inputClass =
  "rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none " +
  "focus:border-accent dark:border-neutral-700 dark:bg-neutral-950 dark:text-white";

const actionButtonClass =
  "rounded-lg border border-neutral-700 px-2.5 py-1 text-xs font-medium text-neutral-300 " +
  "transition-colors hover:bg-neutral-800/60 disabled:cursor-default disabled:opacity-50";

// createdAt/lastUsedAt arrive as `Date` from a server component (listApiTokens
// reads straight off the DB) but as JSON-serialized strings once they've round
// tripped through this component's own fetch calls — accepting both means the
// row doesn't care which path produced it. Rendered as a stable UTC
// yyyy-mm-dd (not toLocaleDateString) so the same token renders identically
// regardless of the viewer's locale/timezone.
function formatDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toISOString().slice(0, 10);
}

/**
 * One existing token's row: label (or "unlabeled") · created · last-used (or
 * "never"), plus its own Revoke button. Mirrors reddit-conversations.tsx's
 * ConversationCard pattern — each row owns its own pending/error state so
 * revoking one token never disables or affects its siblings, and a failed
 * revoke surfaces an inline error rather than silently no-op-ing.
 */
function TokenRow({ token }: { token: McpTokenSummary }) {
  const router = useRouter();
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState(false);

  async function handleRevoke() {
    setRevoking(true);
    setError(false);
    try {
      const res = await fetch(`/api/mcp-tokens?id=${encodeURIComponent(token.id)}`, { method: "DELETE" });
      if (!res.ok) {
        setError(true);
        return;
      }
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setRevoking(false);
    }
  }

  return (
    <li className="flex items-center justify-between gap-3 border-b border-neutral-800/60 py-2 text-sm last:border-0">
      <span className="text-neutral-300">
        {token.label ?? "unlabeled"} · created {formatDate(token.createdAt)} ·{" "}
        {token.lastUsedAt ? `last used ${formatDate(token.lastUsedAt)}` : "never used"}
      </span>
      <div className="flex items-center gap-2">
        {error ? <span className="text-xs text-at-risk">Couldn&rsquo;t revoke — try again.</span> : null}
        <button type="button" onClick={handleRevoke} disabled={revoking} className={actionButtonClass}>
          {revoking ? "Revoking…" : "Revoke"}
        </button>
      </div>
    </li>
  );
}

/**
 * Settings screen's MCP access token manager: mint a new bearer token for
 * the MCP server (admin-only, requireAdmin-guarded route — a token reads
 * every project), see it
 * exactly once, and revoke existing ones. Mirrors reddit-brief-editor.tsx's
 * SaveState + router.refresh() idiom for the generate flow, and
 * reddit-conversations.tsx's honest try/catch handleCopy for the copy box.
 *
 * THE HONESTY RULE: the plaintext token is only ever the exact string the
 * POST response returned — never fabricated, never re-shown after this
 * render tree unmounts (the API cannot recover it; only its hash is
 * stored). A failed generate clears no state that would imply success and
 * shows an inline error instead of a token box. A rejected clipboard write
 * shows "Copy failed", never a false "Copied".
 */
export function McpTokenManager({ tokens }: { tokens: McpTokenSummary[] }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [generateState, setGenerateState] = useState<GenerateState>("idle");
  const [mintedToken, setMintedToken] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<CopyState>("idle");

  async function handleGenerate() {
    setGenerateState("busy");
    setMintedToken(null);
    setCopyState("idle");
    try {
      const trimmed = label.trim();
      const res = await fetch("/api/mcp-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: trimmed ? trimmed : undefined }),
      });
      if (!res.ok) {
        setGenerateState("error");
        return;
      }
      const data = await res.json();
      setMintedToken(data.token);
      setGenerateState("idle");
      setLabel("");
      router.refresh();
    } catch {
      setGenerateState("error");
    }
  }

  async function handleCopy() {
    if (!mintedToken) return;
    try {
      await navigator.clipboard.writeText(mintedToken);
      setCopyState("done");
    } catch {
      setCopyState("error");
    }
  }

  return (
    <div className="panel flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="mcp-token-label" className="eyebrow">
          Label (optional)
        </label>
        <p className="text-xs text-neutral-500">
          A name to remember what this token is for, such as which device or client uses it.
        </p>
        <div className="flex items-center gap-2">
          <input
            id="mcp-token-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            className={`${inputClass} flex-1`}
          />
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generateState === "busy"}
            className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-neutral-900 transition-opacity disabled:cursor-default disabled:opacity-50"
          >
            {generateState === "busy" ? "Generating…" : "Generate token"}
          </button>
        </div>
        {generateState === "error" ? (
          <p className="text-xs text-at-risk">Couldn&rsquo;t generate a token — try again.</p>
        ) : null}
      </div>

      {mintedToken ? (
        <div className="flex flex-col gap-2 rounded-lg border border-neutral-700 bg-neutral-900/40 p-3">
          <p className="text-xs font-semibold text-accent">New token generated</p>
          <p className="text-xs font-medium text-at-risk">
            Copy this now — you won&rsquo;t be able to see it again.
          </p>
          <code className="select-all break-all font-mono text-sm text-neutral-100">{mintedToken}</code>
          <button type="button" onClick={handleCopy} className={`self-start ${actionButtonClass}`}>
            {copyState === "done" ? "Copied" : copyState === "error" ? "Copy failed" : "Copy"}
          </button>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <span className="eyebrow">Existing tokens</span>
        {tokens.length === 0 ? (
          <p className="text-sm text-neutral-500">No tokens yet.</p>
        ) : (
          <ul className="flex flex-col gap-0">
            {tokens.map((token) => (
              <TokenRow key={token.id} token={token} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
