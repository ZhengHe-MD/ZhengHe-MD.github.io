# podcast-audio

The origin for 白鹤札记 episode audio. Serves the MP3 out of R2 and records one row per
audio request in Workers Analytics Engine.

Why it exists, and why the counting rules are not in here:
[docs/podcast-analytics.md](../../docs/podcast-analytics.md).

## Deploy

Everything below needs your Cloudflare login, so it is yours to run. Steps 1–4 are
once; step 5 is every time the Worker source changes.

### 1. Authenticate

```bash
npx wrangler login
```

### 2. Set the listener salt

```bash
npx wrangler secret put LISTENER_SALT --cwd workers/podcast-audio
```

Paste a long random string — `openssl rand -hex 32` produces one.

**This value must never change.** It salts the listener hash; rotating it makes every
returning listener look new and silently inflates every count from that day on. It is
a secret only so that the hashes cannot be brute-forced back into IP addresses.

### 3. Deploy

```bash
npx wrangler deploy --cwd workers/podcast-audio
```

Note the `https://podcast-audio.<your-subdomain>.workers.dev` URL it prints.

### 4. Point the pipeline at it

Add to `.env` in the repo root:

```
PODCAST_AUDIO_BASE=https://podcast-audio.<your-subdomain>.workers.dev
```

`R2_PUBLIC_BASE` stays as it is — it is the *direct* bucket URL, and it is what fetches
the music bed during a render. A bed fetch is a working action, not a download, and
must not be counted.

Then re-point the existing Episode and rebuild:

```bash
node scripts/podcast.mjs upload can-education-still-change-destiny
node scripts/podcast.mjs page   can-education-still-change-destiny
npm run build
```

`upload` re-uploads under the same content-addressed key, this time stamping the
duration as R2 metadata, and rewrites the enclosure URL. `<guid>` does not move, so no
subscriber sees a second Episode.

### 5. Redeploy after changing the source

```bash
npm test
npx wrangler deploy --cwd workers/podcast-audio
```

## Reading the numbers

Create an API token with **Account → Account Analytics → Read**, put it in `.env` as
`CF_ANALYTICS_TOKEN`, then:

```bash
node scripts/podcast.mjs stats
```

Analytics Engine keeps three months. `podcast/stats.json` is the permanent record —
see [docs/podcast-analytics.md](../../docs/podcast-analytics.md) for how often it has
to be run and what happens if it is not.

## Local check

```bash
npx wrangler dev --cwd workers/podcast-audio --remote
```

`--remote` is required: the R2 binding needs the real bucket. Then request an episode
key and confirm the status codes and `content-range` — `npm test` covers the same
ground against a stub, but only the real bucket proves R2 resolves ranges as assumed.

## Free-plan headroom

| | Limit | Used by one download |
|---|---|---|
| Worker requests | 100,000/day | 1–5 |
| Analytics data points | 100,000/day | 1–5 |
| Analytics read queries | 10,000/day | 1 per `stats` run |
| R2 egress | free | 3.2 MB |

Nothing here bills at this Show's scale. The Worker's 10ms CPU budget is untouched by
streaming, which is a pass-through and does no per-byte work.
