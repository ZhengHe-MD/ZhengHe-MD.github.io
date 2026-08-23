# ZhengHe Personal Site

Personal digital garden and publication system for essays, interactive courses, projects, running logs, and talks.

## Docs map

- [CONTEXT.md](CONTEXT.md) — ubiquitous domain vocabulary and collection definitions. Consult before naming, classifying, or routing content.
- [docs/design-brief.md](docs/design-brief.md) — visual design tokens, typography, component mockup specifications, and aesthetic voice.
- [docs/adr/0001-interactive-courses-collection.md](docs/adr/0001-interactive-courses-collection.md) — architectural decision for the standalone interactive courses collection.
- [docs/adr/0002-musement-interaction-feedback-loop.md](docs/adr/0002-musement-interaction-feedback-loop.md) — architectural decision for Musement skip tracking & interaction feedback loop.
- [docs/category-mapping.md](docs/category-mapping.md) — site-wide taxonomy mapping (`思考` vs `实践`).
- [docs/adr/0003-podcast-as-independent-collection.md](docs/adr/0003-podcast-as-independent-collection.md) — architectural decision for the Podcast collection, self-hosted feed, and audio identity.
- [docs/podcast-pipeline.md](docs/podcast-pipeline.md) — 白鹤札记 show metadata and the Speech Script → audio → feed pipeline spec.

## Invariants

- **HTML is the primary manuscript.** Every page is a standalone `.html` file directly openable in a browser. Never introduce an SSG compiler, frontend framework, or markdown preprocessor that mutates source pages in place.
- **Content folders are immutable sources of truth.** `scripts/build.mjs` is the sole build step. It scans content folders (`writing/`, `courses/`), parses `<meta>` tags, and generates aggregates into `_site/` (`index.html`, `/writing/`, `/courses/`, `/categories/`, `/feed.xml`, and forwarder stubs). It never writes back to source folders.
- **Shared chrome via custom elements.** Global navigation (`<site-nav>`) and footer (`<site-footer>`) live as web components in `assets/js/site.js`. Content pages declare `<site-nav active="<collection>"></site-nav>` rather than duplicating navbar markup.
- **Zero-framework styling & theme tokens.** All styles reside in `assets/css/site.css` using CSS custom properties (`--bg`, `--surface`, `--ink`, `--accent`, `--line`). Light and dark themes are driven strictly via `[data-theme="dark"]` on `<html>`. Avoid Tailwind or ad-hoc style utilities.
- **Self-contained assets.** MathJax, syntax highlighting, and web fonts are self-hosted under `assets/vendor/` and `assets/fonts/`. Cloudflare Web Analytics is the only permissible external network beacon.

## Content collections contract

- **Writing (`writing/<slug>/index.html`)**: Long-form essays. Requires `<meta name="date">`, `<meta name="summary">`, and optional `<meta name="category">` (`思考` | `实践`), `<meta name="mathjax" content="true">`, `<meta name="legacy">`. Prose lives in `<div class="prose">`.
- **Courses (`courses/<slug>/index.html`)**: Multi-session interactive courses exported from Course Studio (`interactive-course`). Embeds standalone two-pane reader, session sandboxes, co-design companion drawer, and `<site-nav active="courses"></site-nav>`.
- **Podcast (`podcast/<slug>/index.html`)**: Episodes of 白鹤札记. Authored via `scripts/podcast.mjs` from `episode.md` (frontmatter + Speech Script); the page carries `<meta name="guid">`, `audio-url`, `audio-bytes`, `audio-duration`, `synthesized`. Audio and the music bed live on Cloudflare R2, never in git; `build.mjs` generates `/podcast/feed.xml` (RSS 2.0 + `itunes:`) from the committed pages. Synthesis costs money and never runs in CI.
- **Projects & Talks (`projects/`, `talks/`)**: Curated card galleries.
- **Running (`running/`)**: Dashboard fed by `running/data.json` filtered via `scripts/filter-activities.jq`.
