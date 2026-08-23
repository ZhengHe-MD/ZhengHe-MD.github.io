# 3. Podcast as an Independent Collection with a Self-Hosted Feed

We decided to publish 「白鹤札记」 as a sixth top-level Collection with its own self-hosted RSS 2.0 feed at `zhenghe-md.github.io/podcast/feed.xml`, rather than as an audio rendering of the Writing collection or as a show hosted on a podcast platform. Audio lives on Cloudflare R2, decoupled from episode identity so the storage host can change without breaking subscriptions.

## Context & Problem Statement

The site already publishes long-form essays under Writing, and the obvious framing for a podcast was "Writing, but narrated" — a derived artifact rendered from each essay's `.prose`. That framing is wrong in a way that is cheap to fix now and expensive to fix later: it would make every Episode structurally dependent on a source essay, and would embed that assumption in the directory layout, the build, and the feed.

Separately, podcast distribution has one genuinely irreversible property. Apple Podcasts, Spotify, Overcast and Pocket Casts all treat the **feed URL as the show's unique identifier**. Standard migration requires writing `<itunes:new-feed-url>` plus a 301 on the *old* feed — neither of which is possible on a feed owned by someone else. Choosing where the feed lives is therefore the one decision that cannot be walked back.

## Decision

1. **An Episode is a first-class work, not a rendering.**
   Podcast joins Writing, Courses, Projects, Running and Talks as a Collection. An Episode *may* be adapted from a Writing entry, but is not defined by one, and Episode slugs live in their own namespace. The pipeline's input is consequently the **Speech Script**, not an essay; `Writing → Speech Script` is one adapter among possible others, and today the only one.

2. **The feed is self-hosted and permanent; the audio URL is not.**
   - Feed: `https://zhenghe-md.github.io/podcast/feed.xml` — the show's identity, forever.
   - Audio: Cloudflare R2, served over `*.r2.dev`, filename `<episode-slug>-<hash8>.mp3`.
   - `<guid isPermaLink="false">` is the **episode slug**, never the audio URL.

   Cloudflare documents `r2.dev` as "not intended for production usage", with a variable rate limit and possible bandwidth throttling, and custom cache rules require a custom domain on Cloudflare. This is accepted deliberately: because the guid is decoupled from the enclosure URL, migrating audio to `media.<domain>` later is a feed regeneration that no subscriber observes. The reversible weakness was traded for avoiding a domain purchase now.

3. **Synthesis is authoring; feed generation is build.**
   - `scripts/podcast.mjs` — run by hand. Speech Script → chunk → 火山引擎 TTS → ffmpeg concat + loudnorm → R2 upload → episode metadata JSON. Requires API credentials, costs money, and never runs in CI. This mirrors the role `scripts/sync-draft.mjs` already plays.
   - `scripts/build.mjs` — gains `scanCollection('podcast')`, the `/podcast/` index, per-episode pages, and an RSS 2.0 + `itunes:` emitter that is a pure function of committed files plus the R2 base URL.

   This preserves the AGENTS.md invariant that `build.mjs` is the sole build step, and guarantees `git push` can never spend money.

4. **AI-generation disclosure is per-episode.**
   Under 《人工智能生成合成内容标识办法》 (in force 2025-09), each Episode declares its own synthesis status in its `<description>`, driven by a field in its metadata JSON. The channel description carries only a neutral note that some episodes are synthesized. A blanket channel-level claim was rejected because Episodes are not required to be TTS-generated, so it would eventually misdescribe either a self-recorded episode or the synthesized back-catalogue.

## Considered Options

- **Platform hosting (小宇宙 supplies the RSS).** Rejected: no upload API, so the pipeline breaks at its last step; and the feed URL lock-in above is unrecoverable, zeroing out all generic-client subscribers on any future move.
- **Episode as a property of a Writing entry.** Rejected per decision 1 — it hard-codes a dependency that is not intrinsic to the domain.
- **Buy a custom domain now** (`podcast.<domain>` / `media.<domain>`). Deferred rather than rejected; decision 2 keeps this path open at zero migration cost for subscribers.
- **Serving audio from GitHub Pages.** Rejected: the ToS forbids CDN use for media, and MP3s in git history are permanent.
- **火山's async 长文本 interface** (single call, up to 10万字符). Rejected for the pilot: queue latency of 数十分钟 (up to 3h) makes iteration impractical, and single-shot synthesis would leave the concat/silence/loudness path — the most failure-prone stage — completely untested. Worth revisiting on a genuinely long Episode.
- **SQLite chunk cache** as proposed in the source research. Rejected at this scale: a committed JSON manifest keyed by `hash(text + voice_id + params)` is equivalent at ~5 chunks, and diffs in git.
- **An LLM Markdown→Speech Script rewrite layer.** Deferred. The pilot essay contains no code blocks, tables, links, inline code or subheadings, so the layer would be built against an input that exercises none of it. It is expected to become necessary for a technical Episode.
