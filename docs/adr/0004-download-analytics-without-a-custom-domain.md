# 4. Download Analytics Without a Custom Domain

We decided to count Downloads by serving episode audio through a Cloudflare Worker bound directly to the R2 bucket, published on `workers.dev`, which records one row per audio request into Workers Analytics Engine. The IAB counting rules are applied afterwards, by a hand-run rollup that commits daily totals to `podcast/stats.json`. No custom domain was purchased.

## Context & Problem Statement

The feed went live with no measurement of any kind. Downloads are the one thing in this pipeline that cannot be backfilled: an Episode published today and listened to this week leaves no trace unless something was counting at the time. Every other outstanding item — cover art, transcripts, chapter markers, a custom domain — can be added later with no loss. This one has a clock on it.

The obvious design, and the one the previous handoff assumed, was a Worker in front of the audio on a custom domain. That assumption is what forced the question: audio was being served straight from `pub-*.r2.dev`, and a Worker cannot be routed onto a `r2.dev` hostname. The apparent conclusion was that measurement required buying a domain first.

That conclusion is wrong, and the reason matters: **a Worker with an R2 *binding* does not sit in front of the bucket — it *is* the origin.** It reads the object through the binding and serves the bytes itself. Bindings need no custom domain, and a `workers.dev` route is a perfectly ordinary place to serve from. The domain question and the measurement question turned out not to be coupled at all.

## Decision

1. **The Worker is the audio origin, not a redirect.**
   `workers/podcast-audio` binds the bucket and serves objects directly, with Range and conditional-request support. A redirect hop to `r2.dev` was the alternative; it was rejected because the bytes would then never pass through anything that could measure them, which defeats the purpose, and it costs every listener an extra round trip.

   The Worker serves *only* keys matching `<slug>-<hash8>.mp3` at the path root. It is an episode origin, not a public proxy for the bucket. The music bed and every other object stay unreachable through it.

2. **The Worker records facts; the rollup applies policy.**
   The Worker writes one Analytics Engine row per audio request — episode, listener hash, bytes, size, duration, status, country, User-Agent — and makes no judgement about what a download is. `scripts/podcast.mjs stats` applies the IAB v2.2 rules when it rolls the rows up.

   This is the decision the rest of the design hangs on. A download is a judgement over a *set* of requests, not an event. Applying that judgement at the edge would freeze one reading of the guidelines into ninety days of unrecoverable data. Applying it in the rollup means a corrected reading — a new bot, an unanticipated client fetch pattern — re-derives the entire retained window and the history heals.

3. **`podcast/stats.json` is the archive, not a cache.**
   Analytics Engine retains three months. The committed JSON is the only record of anything older, which is why the rollup is idempotent over its window and carries earlier days through untouched. It is excluded from the published site: download numbers are the author's record, and publishing them should be a decision, not a side effect.

4. **Listener identity is deliberately weak.**
   `SHA-256(salt + IP + User-Agent)`, truncated to 96 bits, salted with a Worker secret. Enough to dedup a day; not enough to reverse into an IP, and not enough to track a person across a month. The raw IP never leaves the Worker. Accepting a coarse key was preferred to storing anything durable about listeners.

5. **`R2_PUBLIC_BASE` and `PODCAST_AUDIO_BASE` are separate.**
   The direct bucket URL stays in use for fetching the pinned music bed during a render. A bed fetch is a working action by the author, not a download, and routing it through the counting path would pollute the data.

## Consequences

The enclosure URL moves from `pub-*.r2.dev` to `podcast-audio.<subdomain>.workers.dev`. Per ADR-0003 this is free: `<guid>` is the Episode's identity and does not move, so no subscriber observes anything. Doing it now, at zero subscribers, costs nothing at all.

`r2.dev`'s documented rate limiting is no longer in the listener path — audio is served by a Worker on Cloudflare's normal request path. The concern ADR-0003 accepted deliberately has quietly gone away for audio, though it still applies to bed fetches, which are rare and authenticated to one machine.

A custom domain remains available and remains unnecessary. Should one arrive later, the Worker moves to `media.<domain>` by adding a route — the counting, the dataset, and the entire committed history are unaffected.

The measurement now depends on the Worker being deployed. If it is down, audio is down. That is a real reduction in robustness compared with serving from `r2.dev`, accepted because Workers' availability is not the weak link in a pipeline that already depends on R2 and GitHub Pages.

## Considered Options

- **Buy a custom domain and put a Worker on it.** Rejected as unnecessary once the binding-versus-proxy distinction was clear. It solves a problem — routing a Worker in front of `r2.dev` — that only exists if the Worker is a proxy.
- **A `workers.dev` Worker that 302s to `r2.dev`.** Rejected: the bytes bypass the measurement entirely, so only the *intent* to download is observable, not how much audio was actually taken. The 1-minute rule becomes unimplementable.
- **Dedup at write time via KV or the Cache API.** Rejected. KV costs a subrequest and a write per unique listener per day against a 1,000/day free write budget; the Cache API is per-colo and would double-count anyone whose requests land in two cities. `COUNT(DISTINCT …)` at query time is supported by Analytics Engine SQL, so the state was unnecessary in both cases — and query-time dedup is also what makes the rules revisable.
- **D1 instead of Analytics Engine.** Rejected for raw request storage: a row per request in a relational store buys queryability that a 90-day rollup does not need, at the cost of write limits and a schema to migrate. Analytics Engine is purpose-built for exactly this write pattern. D1 would only earn its place if the committed JSON stopped being sufficient as the archive.
- **A scheduled Worker (Cron Trigger) doing the rollup automatically.** Deferred. It needs an account API token as a Worker secret and would write results somewhere the repo does not see. The hand-run command matches how the rest of this pipeline already works — `podcast.mjs` holds credentials and runs on the author's machine, `build.mjs` stays pure — and it puts the numbers in git, where they diff.
- **Counting in `build.mjs`.** Rejected on the ADR-0003 invariant: the build must stay a pure function of committed files and must never hold credentials or spend money.
- **A third-party analytics prefix (Podtrac, Chartable, OP3).** Rejected: it reintroduces exactly the dependency ADR-0003 removed — a URL owned by someone else in the listener path, whose disappearance breaks every published enclosure. OP3 is open and would have been the pick if one were needed.
