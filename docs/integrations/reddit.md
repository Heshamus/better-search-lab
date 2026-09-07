# Reddit conversations

Finds threads worth joining for each site, judges fit with the AI assistant, and drafts a reply with citations.

- **Reddit API** (primary, free): create a script app at https://www.reddit.com/prefs/apps and enter the client ID and secret. Application-only OAuth; no user account is linked.
- **Apify** (fallback): an Apify token and the Reddit scraper actor, used when the official API is absent or fails.
- Per site: the knowledge brief and the subreddit list under **Settings → Project → Reddit Conversations**.

Environment overrides: `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT`, `APIFY_API_KEY`, `APIFY_REDDIT_ACTOR`. The AI assistant must be configured for judging and drafting.
