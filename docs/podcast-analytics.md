# 白鹤札记 — Download Analytics

How a Download is counted, and why the machinery is split the way it is.
Rationale: [ADR-0004](adr/0004-download-analytics-without-a-custom-domain.md).
Deploy steps: [workers/podcast-audio/README.md](../workers/podcast-audio/README.md).

## The shape

```
podcast client
      │  GET https://podcast-audio.<subdomain>.workers.dev/<slug>-<hash8>.mp3
      ▼
[1] workers/podcast-audio  — serves the object from R2, records one row per request
      ▼
    Workers Analytics Engine  (90-day retention)
      ▼
[2] node scripts/podcast.mjs stats  — applies the IAB rules, by hand
      ▼
    podcast/stats.json  (committed — the permanent record)
```

**The Worker records facts. The rollup applies policy.** This is the load-bearing
decision, and it is worth being blunt about why: a download is not an event that
happens, it is a judgement over a set of requests. Encoding that judgement at the edge
would freeze today's reading of the IAB guidelines into ninety days of data that
cannot be re-derived. Encoding it in the rollup means the day the reading changes —
a new bot, a client that fetches in a pattern nobody anticipated — the correction is
re-run over the whole retained window and the history heals itself.

So the Worker knows nothing about downloads. It knows about requests.

## What counts as a Download

Per the [IAB Podcast Measurement Technical Guidelines v2.2][iab]:

1. **≥ 60 seconds of audio delivered.** Bytes convert to seconds using the object's own
   duration, stamped as R2 metadata at upload. Episodes are fixed 64kbps CBR, so the
   conversion is exact.
2. **Accumulated per listener, not per request.** Real clients fetch in pieces — three
   25-second range requests are one download, not zero and not three. Partial listens
   expire after 24 hours rather than accruing forever.
3. **At most one per listener, per Episode, per 24 hours.** The window is half-open:
   a request at exactly +24h opens a new one.
4. **GET only**, status 200 or 206. HEAD transfers no audio and is never a download.
5. **Bots excluded.** Obvious crawlers are dropped at the edge; the rest is a regex in
   the rollup, where the judgement stays reversible.

A **Listener** is `SHA-256(salt + IP + User-Agent)`, truncated to 96 bits. That is the
entire identity model — enough to tell two requests apart for a day, not enough to
reverse into an IP. The raw IP never leaves the Worker and is never stored.

The salt is a Worker secret and **must never rotate**: rotating it makes every
returning listener look new and silently inflates counts.

## The 90-day cliff

Analytics Engine retains data points for three months. `podcast/stats.json` is
therefore not a cache — it is the archive, and the only copy of anything older than
90 days.

**Run `node scripts/podcast.mjs stats` and commit the result at least once a quarter.**
Miss that window and those days are gone; nothing can reconstruct them. Running it
after each release is the habit that makes this a non-issue, which is why it is a step
in [podcast-release.md](podcast-release.md).

The command re-derives every day inside its window and carries earlier days over
untouched, so running it more often is free and never double-counts.

```bash
node scripts/podcast.mjs stats              # last 90 days, writes the file
node scripts/podcast.mjs stats --days 30    # narrower window
node scripts/podcast.mjs stats --dry-run    # print, write nothing
```

`stats.json` is excluded from the published site. Download numbers are the author's
record; publishing them is a separate decision, not a side effect of keeping them.

## What is deliberately not measured

- **Completion, drop-off, listen-through.** A download is not a listen. Range patterns
  hint at it, and the rows are there to mine later, but no claim is derived today.
- **Anything on the episode page.** The page carries no beacon. The `<audio>` element
  points at the same Worker, so pressing play on the site counts exactly like any other
  client — which is correct, and requires nothing extra.
- **Unique listeners over time.** The listener hash is deliberately weak: it changes
  with IP and User-Agent. It answers "is this the same fetch as an hour ago", not
  "is this the same person as last month". Do not build audience metrics on it.

## Known deviations from the standard

Stated plainly, because a number nobody can characterise is worse than no number:

- **IP+UA is a coarse listener key.** Two people behind one NAT with the same phone
  model collapse into one; one person on wifi then cellular splits into two. Every
  self-hosted measurement has this problem; the IAB guidelines assume it.
- **No IP-range exclusion.** The guidelines call for dropping known data-centre ranges.
  Only User-Agent filtering is implemented.
- **Sampling.** Analytics Engine may sample at high volume. `stats` warns when it
  detects this, and the counts then read as floors rather than exact. Not reachable at
  this Show's scale.

## Free-plan headroom

100,000 Worker requests/day, 100,000 data points/day, 10,000 read queries/day, and R2
egress is free. One download costs 1–5 of each of the first two, and one `stats` run
costs one query. There is no billing exposure here at any plausible scale for this Show.

[iab]: https://iabtechlab.com/wp-content/uploads/2024/02/PodcastMeasurement_v2.2_final.pdf
