# Music bed

The bed lives on R2, not in git. `bed.json` pins it by content hash:

```bash
node scripts/podcast.mjs bed --from ~/music/whatever.mp3
```

That uploads it to `assets/bed-<hash8>.<ext>` and writes `bed.json`. `synth` then
resolves it from the local cache, or fetches it from R2 and verifies it against the
pinned hash — so a given commit always renders with the same bed, and overwriting
the object on R2 fails loudly instead of silently changing past episodes.

With no `bed.json` and no loose `bed.*` file here, episodes are published dry.

The bed is looped to fit, so a seamless 60–120s loop is enough — it does not need
to be episode-length. It is normalized to a fixed level before mixing, so its own
mastering level does not matter.

Structure applied by the pipeline (constants at the top of `scripts/podcast.mjs`):

| | |
|---|---|
| Lead-in, full volume | 8s |
| Duck ramp | 1.5s, ending as narration starts |
| Level under narration | 0.12 |
| Swell back | 2s from the end of narration |
| Outro, full volume | 12s |
| Fade out | 3s |

This file is the show's, not an episode's — one bed, reused across every Episode.
