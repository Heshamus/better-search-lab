# AI assistant

Optional. Used for niche extraction during profiling, phrasing the weekly actions, and judging and drafting Reddit replies.

Under **Settings → Integrations → AI assistant** choose a provider preset — DeepSeek, OpenAI, Anthropic, OpenRouter, Groq, Together, Gemini, Ollama (local, no key), or a custom OpenAI-compatible endpoint — paste the key, keep or change the model, and **Test**. After saving, the model field lists what the provider reports.

Environment overrides: `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_API_KEY` (or the legacy `DEEPSEEK_API_KEY`), `LLM_MODEL`, `LLM_EFFORT` (Anthropic reasoning depth).
