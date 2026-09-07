# Google Search Console and Analytics

Two ways to authenticate:

- **Service account** (recommended for a private install): create a service account in Google Cloud, download its JSON key, paste the JSON (raw or base64) into **Service-account key**. Grant the account's email read access to the Search Console property and the GA4 property.
- **OAuth**: create OAuth credentials in Google Cloud, register the redirect URI the app shows (`<App URL>/api/google/callback`), enter the client ID and secret, then connect each site from its Search Console page.

Environment overrides: `GOOGLE_SA_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`. Both APIs are free.
