# Google Connect in onboarding — design spec

Status: draft for owner review · 2026-09-13 · targets Better Search Lab (self-hosted)

## 1. Problem & goal

Google Search Console (GSC) and Google Analytics 4 (GA4) are central to tracking, but
connecting them today is the worst step in setup: the self-hoster must open Google Cloud
Console, create an OAuth **web client** (id + secret), register a redirect URI, *or* mint a
service-account key and grant it on each property. That is the "awful stuff" we want to delete.

Goals:

1. Add a **Google Search Console + Analytics** step to onboarding (and keep it in Settings → Integrations).
2. Make connecting **one click** — no Google Cloud Console for the user — while the app stays self-hosted.

Non-goal / hard constraint: GSC and GA4 expose the **user's own private data**. Only Google can
grant access to it, so *some* Google sign-in is unavoidable — DataForSEO cannot substitute. We are
removing the client-creation burden, not the sign-in.

## 2. What exists today

- `src/lib/config/registry.ts` (group `google`): `clientId`, `clientSecret`, `serviceAccountKey`, `redirectUri`.
- `src/lib/google/oauth.ts`: a standard **confidential web** OAuth flow — `client_id` + `client_secret` + `redirect_uri` + `response_type=code` + `access_type=offline`. No PKCE, no loopback.
- Routes: `src/app/api/google/connect/route.ts` (start) and `src/app/api/google/callback/route.ts` (exchange).
- Read scopes needed: `https://www.googleapis.com/auth/webmasters.readonly` (GSC) and `https://www.googleapis.com/auth/analytics.readonly` (GA4). Both are Google **"sensitive"** scopes → require consent-screen **verification** (brand review), but not the heavier "restricted" tier (no CASA security assessment).

## 3. The core difficulty (why this needs a spec, not a patch)

A self-hosted app runs on **many different origins**: `http://localhost:3000`, `http://localhost:3939`, `https://seo.some-company.com`, … A single shipped OAuth client cannot pre-register every one of those redirect URIs, and the client **secret cannot ship** in an open-source image (it would not be secret). Two mechanisms get us to one-click, each with a catch:

- **Loopback + PKCE (public client, no secret).** Ship a public "Desktop" client id; the browser round-trips to `http://127.0.0.1:<port>`. Zero secret, zero central service. **Works only when the browser and the app are on the same machine** — i.e. localhost installs.
- **Hosted broker.** A central service holds the secret, does the code→token exchange, and relays the token back to the install. Works for **localhost and real domains**. But a central relay that will return Google tokens to install-provided URLs introduces a **token-exfiltration risk** (§5) and a central dependency that rubs against "your data stays on your server".

## 4. Recommended architecture — a hybrid (delivers "one-click everywhere" with a smaller blast radius)

Route by install origin, decided automatically:

- **Localhost / same-machine installs → loopback + PKCE.** No broker involved. This is the common self-host case and carries **no relay/exfiltration surface**.
- **Domain installs → the hosted broker.** Only installs that are *not* reachable via loopback use the central service.

This still gives the owner's chosen outcome — **one click on both localhost and real domains** — but the broker only ever handles the minority (domain) case, and never sees the SEO/analytics data itself (only the transient auth handshake). The refresh token is **encrypted to the install** and the broker **stores nothing**.

Both paths reuse the existing encrypted `google` config storage for the resulting refresh token; the existing **manual web-client / service-account** path stays as an "Advanced" option and as the fallback if verification is pending.

### 4.1 Loopback + PKCE flow (localhost)

1. App detects the browser can reach it on loopback. It starts a local, one-time listener (or reuses its own `:3000`), generates PKCE `code_verifier`/`code_challenge` + `state`.
2. Opens Google's consent URL with the **shipped public Desktop client id**, `redirect_uri=http://127.0.0.1:<port>/api/google/callback`, the two read scopes, `access_type=offline`, `code_challenge`.
3. Google redirects back to loopback with `code`; the app exchanges `code`+`code_verifier` directly with Google's token endpoint (no secret needed for a Desktop client + PKCE) and stores the refresh token.

### 4.2 Brokered flow (domain installs)

1. **Install → broker (start):** the install generates `state`, a PKCE pair, **and an ephemeral X25519 keypair**; stores the private key + state in its own server session. It calls the broker with: its **return URL** (`https://install/api/google/callback`), `state`, `code_challenge`, its **public key**, and a signed proof-of-domain (§5).
2. **Broker → Google:** the broker redirects the browser to Google's consent screen using the **web client id**, `redirect_uri = https://connect.bettersearchlab.com/callback`, the two read scopes, `access_type=offline`, `code_challenge`.
3. **Google → broker (callback):** the broker exchanges `code`+`code_verifier`+**client secret** with Google, gets the refresh token, **encrypts it to the install's public key** (libsodium sealed box), and redirects the browser to the install's return URL with the sealed blob + `state`. The broker **persists nothing**.
4. **Install (finish):** verifies `state` against its session, decrypts the blob with its private key, stores the refresh token in the encrypted `google` config. Done.

## 5. Security model (the part that must be right)

Threats and mitigations for the brokered path:

- **CSRF / flow injection** → `state` is generated by the install, kept in its server session, and checked on return. PKCE binds the code to the initiating flow.
- **Token relay to an arbitrary origin (the real one).** A broker that returns tokens to any install-provided URL is an open relay: an attacker can start a legitimate flow (their own return URL + keypair), get a real "Better Search Lab" consent link, and **phish a victim into clicking *Allow***; Google then issues the *victim's* token to the *attacker's* return URL. Mitigations, none individually complete:
  - **Read-only scopes only.** The blast radius is read access to the victim's GSC/GA4 — a privacy breach, not account takeover or write. This bounds severity; it is the most important mitigation.
  - **Encrypt-to-install-pubkey + `state` binding.** Stops passive interception and cross-install replay (but not attacker-initiates-then-phishes, since the attacker holds the matching private key).
  - **Proof-of-domain.** Before relaying to `https://install/…`, the broker fetches `https://install/.well-known/bsl-connect.json` and checks it carries the flow's `state`/challenge. This forces the return URL to be a real, cooperating BSL install and gives us logging + rate-limiting + abuse revocation, but an attacker controlling their *own* domain can still satisfy it — so it narrows, not closes, the phishing case.
  - **Loud consent + short-lived one-time relay tokens + a "you are connecting <domain>" interstitial** on the install side before the redirect, so a user who did not initiate a connect is unlikely to complete one.
  - **Decision to make (owner):** accept the residual read-only phishing risk with these mitigations, or gate the broker behind the install pre-registering with the broker (loses "zero setup" for domain installs). Recommendation: accept it, read-only + proof-of-domain + interstitial, and revisit if abused. The loopback path (localhost) has **none** of this surface, which is why the hybrid keeps the broker off the majority of installs.
- **Broker never stores tokens.** It is stateless: transient code exchange, encrypt, redirect, forget. The web-client secret lives only as a Cloudflare Worker secret. No user data (SEO/analytics) ever transits the broker — only the OAuth handshake.
- **"Your data stays on your server" statement.** True for the data; the *auth handshake* for domain installs transits a BSL-run stateless relay that stores nothing. We state this plainly in the connect UI and the privacy policy.

## 6. Onboarding & Settings UX

- New setup step **"Connect Google Search Console & Analytics"** (optional, admin-only), placed after the site step. One button: **Connect Google**. On success it lists the GSC properties + GA4 properties the account can see and lets the user pick which map to the project.
- Same connect button in **Settings → Integrations → Google**, with an **Advanced** disclosure that keeps the current manual web-client and service-account fields for air-gapped installs or those who prefer their own client.
- If the shipped OAuth app's verification is still pending, show the "unverified app → proceed" note honestly, or fall back to Advanced.

## 7. Owner's checklist (things only the owner can do — I cannot)

1. In Google Cloud Console, create **two OAuth clients** under one project + consent screen:
   - a **Desktop** client (public, no secret) for the loopback path — ship its client id in the app;
   - a **Web** client (with secret) for the broker — redirect URI `https://connect.bettersearchlab.com/callback`; the secret goes into the Worker, never the repo.
2. Configure the **OAuth consent screen** and submit for **verification** for the two sensitive scopes (`webmasters.readonly`, `analytics.readonly`): app name "Better Search Lab", the new logo, homepage `https://bettersearchlab.com`, privacy policy `https://bettersearchlab.com/privacy` (both live), authorized domain `bettersearchlab.com`. Until verified: "unverified app" warning + a 100-user cap on the shared clients.
3. Decide the broker host (recommend a **Cloudflare Worker** at `connect.bettersearchlab.com`) and set its secret.
4. Ratify the §5 residual-risk decision.

## 8. Build sequence (once §7.1–7.2 exist)

1. The broker Worker (stateless: `/start`, `/callback`; sealed-box encrypt; proof-of-domain fetch; no storage).
2. App: PKCE + loopback flow; add the shipped Desktop client id config.
3. App: brokered flow (ephemeral keypair, `/.well-known/bsl-connect.json`, decrypt-and-store), origin detection to pick loopback vs broker.
4. App: onboarding step + Settings connect button + property picker; keep Advanced.
5. Tests: request-shape/unit tests for both flows against a mock broker + mock Google (no live secrets, same approach as the LLM fixes); docs.

## 9. Open decisions for the owner

- **A. Ratify the hybrid** (loopback for localhost, broker only for domains) vs a pure broker for everything. Recommendation: hybrid — same one-click outcome, far smaller broker surface.
- **B. §5 residual-risk stance** for domain installs.
- **C. Broker host** (Cloudflare Worker at `connect.bettersearchlab.com`?) and who operates it.
- **D. Verification ownership** — the owner drives Google's review; expect days–weeks and a possible cap until done.

Nothing here is built yet. On owner sign-off of §9, this goes to an implementation plan (writing-plans), and the app-side flows are built with tests while the Google-side verification proceeds in parallel.
