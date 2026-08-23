# 白鹤札记 — Podcast Pipeline

Design spec for the Podcast collection and its authoring pipeline.
Domain vocabulary: [CONTEXT.md](../CONTEXT.md). Rationale: [ADR-0003](adr/0003-podcast-as-independent-collection.md).

## Show

| | |
|---|---|
| Title | 白鹤札记 |
| Author / owner | 郑鹤 · `ranchardzheng@gmail.com` |
| Feed URL | `https://zhenghe-md.github.io/podcast/feed.xml` (permanent — see ADR-0003) |
| Category | Society & Culture › Philosophy · secondary: Technology |
| Language | `zh-CN` |
| Explicit | `false` |
| Cover art | `podcast/cover.jpg`, 1400×1400 — upscaled from a 1254px source. Clears Apple's floor; worth regenerating natively at 3000×3000. |

Channel description:

> 围绕我对这个世界的疑问展开：技术、教育、人性，以及那些还没想明白的事。不限定领域，只跟着问题走。
>
> 本节目部分单集由文本转语音技术合成，具体见各单集说明。

## Pipeline

```
Speech Script (committed, hand-editable)
      │        ← Writing → Speech Script is ONE adapter, not the pipeline root
      ▼
[1] chunk on paragraph boundaries (300–600 字)
      ▼
[2] 火山引擎 TTS, synchronous endpoint, fixed preset Voice
      ▼
[3] ffmpeg concat (paragraph gap 600–800ms) + loudnorm
      ▼
[4] upload to R2  →  write episode metadata JSON (committed)
      ▼
[5] build.mjs emits /podcast/, episode pages, feed.xml
```

Steps 1–4 are `scripts/podcast.mjs`, run by hand. Step 5 is `scripts/build.mjs`, run in CI.
The split is load-bearing: synthesis needs credentials and costs money, so it must never run on push.

### Chunking

- 300–600 字 per chunk, split only on paragraph boundaries — never mid-paragraph.
- Rationale for chunked-over-single-shot in ADR-0003.

### Synthesis

Voice: **渊博小叔 2.0** — `zh_male_yuanboxiaoshu_uranus_bigtts` (豆包语音合成模型 2.0).
Note the suffix convention: 2.0 voices end `_uranus_bigtts`, 1.0 voices end `_moon_bigtts`. They are different voices and the ids are not interchangeable.

API — 豆包语音 **v3**, 单向流式语音合成 HTTP:

- `POST https://openspeech.bytedance.com/api/v3/tts/unidirectional`
- Headers: `X-Api-App-Id`, `X-Api-Access-Key`, `X-Api-Resource-Id: seed-tts-2.0`
- Body: `req_params.speaker`, `req_params.audio_params`, `req_params.additions`
- Response is a stream of JSON frames carrying **base64** audio to decode and concatenate.
- Reuse the HTTP connection — server keep-alive is 60s.

There is no `cluster` field in v3; `X-Api-Resource-Id` replaces it, and the 2.0 resource id only accepts 2.0 voices (mismatch returns `45000000 speaker permission denied`).

Credentials in a gitignored `.env`: `VOLC_APP_ID`, `VOLC_ACCESS_KEY`, `VOLC_RESOURCE_ID`, `VOLC_SPEAKER`.

Chunk manifest keyed by `hash(text + speaker + params)`, committed. Editing one paragraph re-synthesizes one chunk.

Voice cloning deferred (timbre drift across chunk boundaries; ~10 free trial slots on 声音复刻 2.0 when revisited).

**Synthesize to WAV, not MP3.** Volcengine documents that MP3 output always carries up to 100ms of unremovable leading silence, while WAV's can be fully trimmed. Encoding per chunk would accumulate that across every chunk boundary and requantize on concat. So: request WAV/PCM per chunk, concatenate, then encode to MP3 exactly once.

Useful `additions` parameters:

| Parameter | Use |
|---|---|
| `silence_duration` | 0–30000ms appended at the end of the request's text — supplies the inter-paragraph gap directly, since one chunk is one paragraph |
| `enable_timestamp` | returns sentence and word timestamps — the raw material for `<podcast:transcript>` and chapter markers |
| `explicit_language: "zh-cn"` | 中文为主, 支持中英混 — correct for essays containing "AI" |
| `aigc_watermark` | appends an audio marker identifying the output as AI-generated |

⚠️ **豆包语音合成模型 2.0 音色 do not support SSML.** The pronunciation-dictionary-via-SSML-`phoneme` approach does not apply to this Voice. 2.0 voices instead support 指令遵循 (natural-language instructions) — see [语音指令与标签](https://www.volcengine.com/docs/6561/1871062). Any future pronunciation-control layer must target that mechanism, not SSML.

### Audio post-processing

- Paragraph gap 600–800ms; chapter gap 1.2–1.5s. No silence inserted between sentences — the engine supplies it.
- `ffmpeg -i in.wav -af loudnorm=I=-16:TP=-1.5:LRA=11 -ar 44100 -ac 1 -b:a 64k out.mp3`
- Output: mono MP3, 64kbps. Podcast loudness standard is -16 LUFS mono.

### Identity and storage

- `<guid isPermaLink="false">` = **episode slug**. Permanent. Never the audio URL.
- Audio object key: `<episode-slug>-<hash8>.mp3`. Re-synthesis mints a new URL; the guid does not move.
- MP3 is gitignored — R2 is the store. Committed: Speech Script, chunk manifest, episode metadata JSON.
- Feed generation is a pure function of committed files plus the R2 base URL, which is a single config value.

### Downloads

Listener-facing audio is served by `workers/podcast-audio`, a Worker bound to the same
R2 bucket, which records one row per request into Workers Analytics Engine.
`node scripts/podcast.mjs stats` applies the IAB counting rules afterwards and commits
daily totals to `podcast/stats.json`. Full design: [podcast-analytics.md](podcast-analytics.md).

`R2_PUBLIC_BASE` stays the *direct* bucket URL — it is what fetches the pinned music bed
during a render, which is a working action and not a download. `PODCAST_AUDIO_BASE` is
the Worker, and only enclosure URLs use it.

### Compliance

Each Episode's `<description>` carries its own AI-synthesis disclosure, driven by a field in its metadata JSON — per 《人工智能生成合成内容标识办法》. See ADR-0003 decision 4.

## Pilot

`读书还能改变命运吗？` — adapted from [writing/can-education-still-change-destiny](../writing/can-education-still-change-destiny/index.html).
2,014 chars across 12 paragraphs → ~5 chunks → ~7.5 min → well under ¥1 per full run.

The essay contains no code blocks, tables, links, inline code or subheadings, so the Speech Script is a deterministic extraction plus a hand pass over `……` and the mismatched `“` quote.

## Deliberately out of scope for the pilot

- LLM Markdown→Speech Script rewrite layer (nothing in the pilot exercises it — ADR-0003)
- Regenerating the Show cover natively at 3000×3000 (the committed one is an upscale)
- `<podcast:transcript>` and chapter markers (cheap later; the Speech Script is already committed)
- Custom domain for feed and audio
- Multi-provider `TTSProvider` abstraction — 火山 only until there is a second engine to abstract against
