# FAQ

**Do I need an AI key?** No. The AI assistant is optional; without it, profiling uses the site's own phrases and the opportunity engine explains itself with its own text.

**Which AI providers work?** Any OpenAI-compatible API (DeepSeek, OpenAI, OpenRouter, Groq, Together, Gemini's compatible endpoint, a local Ollama) and Anthropic.

**Can several people use one install?** Yes. The first person becomes the admin and adds others under Settings → Users. Members see everything except Integrations, Users and MCP tokens.

**Where are my API keys stored?** Encrypted (AES-256-GCM) in the database with a key derived from `AUTH_SECRET`, or `ENCRYPTION_KEY` if you set one. They never reach the browser; the Integrations page shows only whether a value is set.

**I set a variable in `.env` but the app shows it as read-only.** That is the rule: an environment variable overrides the in-app value and the field says "set via …". Remove the variable to edit in the app.

**Sign-in fails behind my proxy.** Set `APP_URL` to the public address. If you have two proxies in front of the app, also set `TRUSTED_PROXY_HOPS=2`.

**Can I import my existing keywords?** Add them under Keywords, or paste them in the profile step; the wizard tracks what you select.

**How do I run the demo?** `docker compose -f docker-compose.demo.yml up -d`, then **Explore the demo** on the login page.

**Does the worker need to run?** Yes for scheduled refreshes and every long job (profiling, builds, audits). Compose starts it; on Railway it is the second service.
