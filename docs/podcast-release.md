# Releasing an episode of 白鹤札记

Ordered runbook. For *why* the pipeline is shaped this way — audio parameters, the
loudness chain, the storage and identity model — see
[podcast-pipeline.md](podcast-pipeline.md).

## Prerequisite

`.env` must exist **in the working tree you run from**. Git worktrees do not share
it; copy it from the main checkout. It needs `VOLC_APP_ID`, `VOLC_ACCESS_KEY`, and
the five `R2_*` keys. `scripts/podcast.mjs` fails naming the missing key.

## New Episode

### 1. Draft the Speech Script

```bash
node scripts/podcast.mjs draft <episode-slug> --from-writing <writing-slug>
```

Writes `podcast/<slug>/episode.md` — frontmatter plus the Speech Script. Refuses to
overwrite an existing one, because your hand edits are the asset.

Adapting a Writing entry is one adapter, not the only path: an Episode with no
source work is written by hand into the same file.

**Done when** you have read the whole Script as it will be *heard*, and fixed what
reads badly aloud: mismatched quotes, `……`, bare English tokens, anything whose
written form differs from its spoken one. No tool checks this step. It is the only
place the text can still be fixed cheaply.

### 2. Synthesize, upload, publish the page

```bash
node scripts/podcast.mjs all <episode-slug>
```

Runs synth → upload → page. Costs about **¥0.7** for ~2,000 characters. Chunks are
cached by `hash(text + speaker + params)`, so a re-run after editing one paragraph
re-synthesizes one chunk and costs nothing for the rest.

**Done when** it prints the duration, the R2 URL, and a program loudness near
**-16 LUFS**.

### 3. Listen to the whole thing

**Done when** you have heard it start to finish — not skimmed. Listen specifically
at the paragraph seams, at the music loop points (the bed repeats every ~140s), and
at the final sentence, where the voice decays fast and the outro swells over it.

### 4. Cover art

```bash
node scripts/podcast.mjs cover <episode-slug> --from <image>
```

Optional per Episode; the Show cover is used when absent.

**Done when** the JPEG still reads at **55×55 px** — its real size in a podcast app.

### 5. Ship

```bash
npm run build          # verification only — CI runs this itself
git add podcast/ && git commit && git push
```

`.github/workflows/deploy.yml` builds and publishes on push to `main`. Never commit
`_site/`.

**Done when** `https://zhenghe-md.github.io/podcast/feed.xml` lists the Episode with
a working `<enclosure>` URL.

## Re-rendering an existing Episode

Edit `episode.md`, then `node scripts/podcast.mjs all <slug>`.

The new render gets a new content hash, so it uploads under a **new** R2 key and the
`<enclosure>` URL changes — while `<guid>` stays fixed. That pairing is deliberate:
clients key subscriptions off the guid and cache by URL, so subscribers get the new
audio without the Episode appearing twice. The superseded R2 object is orphaned;
harmless inside the 10GB free tier.

## Swapping the music bed

```bash
node scripts/podcast.mjs bed --from <audio file>
```

Uploads to a content-addressed key and repins `podcast/music/bed.json`. Then re-run
`all` on each Episode you want re-rendered — speech is cached, so this is free and
takes seconds per Episode.

A new bed wants: **no fade at the file edges** (it breaks the loop), even dynamics,
and no vocals. Its mastering level does not matter — it is normalized before mixing.

## Invariants

- **`<guid>` never changes.** It is the Episode's identity to every client.
- **The feed URL never changes.** `zhenghe-md.github.io/podcast/feed.xml` is the
  Show's identity to Apple, Spotify and Overcast; a new URL means zero subscribers.
- **Synthesis never runs in CI.** It needs credentials and spends money.
- **Audio and the music bed never enter git.** They live on R2. Cover JPEGs do.
