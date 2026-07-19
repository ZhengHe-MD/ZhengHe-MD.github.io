# Design Brief — ZhengHe personal website

> **Status:** design phase complete; all decisions locked (2026-07-19). Awaiting the author's go-ahead to start implementation.
> **This document fixes *structure, content, and behavior*.** The originally-open *visual layer* (§10) is now resolved by the approved standalone mockup; the concrete tokens and every implementation decision are recorded in **§14**.
>
> **Pipeline:** Grill/spec (done) → Claude Design — visual mockup (done) → **Implementation (next, on the author's call)**.

---

## 1. Goal & audience

Upgrade a Chinese-language Hexo/NexT **blog** into a unified, HTML-native **personal website** — one place for everything ZhengHe publishes: writing, projects, running, talks, TIL, and more later (e.g. photography).

- **Primary language:** Chinese (zh-CN). Some Latin text (slugs, code, tech names) throughout.
- **Tone:** identity-first — the site should read as "who I am and what I do," not "a blog." It replaces / absorbs today's scattered properties: the blog, `equator` (running), `resume`, `machine-talk-slides`.
- **Host:** GitHub Pages at the root `https://zhenghe-md.github.io/`, from the new repo `ZhengHe-MD.github.io`. No custom domain.

## 2. Guiding principle — HTML as the primary medium

HTML (not Markdown) is the **primary source format for every piece of content**, including prose posts. Rationale: posts may embed interactive widgets that Markdown cannot express, so HTML-native is a *requirement*, not a preference. Markdown is demoted to a disposable draft format that gets converted to HTML before publishing.

## 3. Architecture (decided)

- **Static site**, no server, no runtime database.
- **Shared chrome = single source of truth.** One stylesheet + web-component nav/footer + shared feature scripts (image zoom, code styling, MathJax, etc.). Every page is a real, standalone `.html` file that pulls chrome from these shared files — no per-page chrome duplication.
- **Content-indexer build step.** A small script scans the content folders and auto-generates all *aggregates* — collection index pages, the Home "latest" strip, category pages, and the feed — by reading each page's own embedded metadata. **The folder is the source of truth; the indexer never rewrites content pages, only builds lists.**
- **Each content page carries its own metadata** (title, date, category, summary, flags like `mathjax`) in an embedded block the indexer reads.

## 4. Information architecture

**Primary nav (by content *type*):** Writing · Projects · Running · Talks · About
**Home** is a hub (see §5). **TIL** is its own collection, surfaced on Home but not (yet) in the top nav. **Photography** is deferred until there's content.

## 5. Sections — content models & behavior

### Home  (`/`)
Identity-first landing: avatar, one-line bio, links, and a row of section tiles (Writing / Projects / Running / Talks / TIL). Below that, an auto-generated **"latest" strip** pulling the newest few items across *all* collections (built by the indexer).

### Writing  (`/writing/`, posts at `/writing/<slug>/`)
Long-form essays (the 49 migrated posts + new ones). Each post: title, date, one category, a `summary` (from the old `<!--more-->` cut), body. Index is a chronological list with a simple category filter. Math via a per-page `mathjax` flag.

### TIL  (`/til/`)
"Today I learned" — short, frequent entries. **Each TIL is its own page** (shareable URL, and free to contain a code snippet / small diagram / interactive widget). The `/til/` index auto-composes them into a **newest-first stream** showing each entry's title, date, and body. Distinct visual treatment from long-form Writing.

### Projects  (`/projects/`)
**Curated showcase** (hand-picked, NOT auto-listed from GitHub). Each project is a rich card: poster/screenshot, title, one-line description, tech tags, links (live demo / repo / related writeup or talk). **Detail / case-study pages are optional per project** — flagship work gets one; smaller things are just a card that links out.

### Running  (`/running/`)
Absorbs the existing `equator` dashboard as static in-site HTML/CSS/JS. See §11 for components and data.

### Talks  (`/talks/`)  *(parked — revisit during design)*
Uniform **talk card**: poster, title, event/venue, date, short description. Behaves two ways by host: embeddable (Bilibili/YouTube) → inline player; non-embeddable → thumbnail + "watch on X →". Optional "slides →" link. Likely hosts going forward: Bilibili / YouTube (both embed cleanly).

### About  (`/about/`)
Bio / personal info (migrated + refreshed).

### Category pages  (`/categories/<name>/`)
See §6.

## 6. Site-wide taxonomy — categories only

One **shared, site-wide category system** applies to **all** collections (a Writing post, a TIL, and a Project can all be filed under the same category). **Tags are dropped entirely.** Category is **optional** per item, drawn from a **small controlled list**.

**Resolved (2026-07-19):** the controlled list is exactly **思考 / 实践**. Today's blog carries 6 legacy categories (论文 11 · 系统设计 10 · 实践 10 · 思考 8 · 编程 5 · 读书 4, plus 1 uncategorized) that mixed two axes (intent vs. subject). All 49 posts are **reclassified into 思考 / 实践** at migration by reading each piece (build/do → 实践; read/reflect/analyze → 思考), **not** by a blind label merge. The author reviews the full per-post mapping table before it is baked in.

This adds a **topic axis orthogonal to the type-based nav**: the indexer generates **cross-collection `/categories/<name>/` pages** aggregating every item under a category regardless of which collection it lives in.

## 7. URL map & old-link preservation

| Path | Content |
|---|---|
| `/` | Home |
| `/writing/` · `/writing/<slug>/` | Writing index · post |
| `/til/` | TIL stream (individual entry pages under it) |
| `/projects/` | Projects gallery (optional detail pages) |
| `/running/` | Running dashboard |
| `/talks/` | Talks |
| `/about/` | About |
| `/categories/<name>/` | Cross-collection category page |

- **Dates dropped** from post URLs (old scheme was `/blog/YYYY/MM/DD/slug/` → new `/writing/slug/`).
- **Old links preserved:** every old `/blog/...` URL gets a **client-side forwarder stub** (`<meta refresh>` + `<link rel="canonical">`) to its new home. GitHub Pages can't do server 301s; the indexer generates all stubs automatically from the old→new slug mapping (slugs are already clean English filenames).

## 8. Integrations

- **Comments:** Giscus (GitHub Discussions) — no ads/tracking, GitHub-native. (Requires enabling Discussions on the repo.)
- **Analytics:** **Cloudflare Web Analytics** (chosen 2026-07-19) — cookieless, no consent banner, no PII. Site registered under host `zhenghe-md.github.io`; beacon token `ba6353705dc04c448779a37c8fa6a89e` (public by design — it ships in the page HTML to every visitor) injected **once** via the shared chrome. This is the site's only third-party request (`static.cloudflareinsights.com`). The dead `UA-172943223-1` Universal Analytics tag is removed.
- **Feed:** an Atom/RSS feed is generated by the indexer.

## 9. Migration notes (from Hexo)

- 49 posts → one-time md→html conversion. Preserve categories (mostly 思考/实践), dates, and the hand-placed `<!--more-->` excerpt as a `summary` field.
- 3 posts use MathJax → per-page flag + shared feature script.
- Post asset folders / images, footnotes, and code highlighting are **implementation-phase** concerns.

## 10. What the design phase had to decide (the visual layer) — RESOLVED

These were intentionally left open for the design phase. They are now **resolved by the approved standalone mockup**; the concrete palette / type / layout tokens are recorded in **§14**. Original checklist:

1. **Palette** — light and dark (the site should be theme-aware).
2. **Typography** — Chinese + Latin pairing, hierarchy, reading measure for long-form essays.
3. **Layout & spacing system** — grid, content width, rhythm.
4. **The identity/Home treatment** — how the "who I am" landing feels.
5. **Per-collection visual voice** — especially how TIL (short/stream) and Projects (gallery) differ from Writing (long-form), while staying one coherent system.
6. **The shared chrome** — nav (incl. mobile) and footer as web components.
7. **Component-level feel** — cards (project/talk/latest), category chips, code blocks, the running dashboard widgets.

## 11. Running dashboard — reference (for the mockup)

Absorbed from `equator`. **Goal:** run 40,075 km (Earth's circumference) by ~2048. Rebuild these components in vanilla HTML/CSS/JS:

- **Hero summary:** title, `completed / goal` km, remaining km, a **progress bar** with animated runner GIFs positioned along it, a 🏁 finish flag, **milestone ticks** (25/50/75/100% with projected dates), start point, last-sync date.
- **Year cards** (one per year, first-activity-year → 2048): year total, stage badge (已结束 / 进行中 / 未开始), a **GitHub-style daily heatmap** (6 intensity buckets), and a **12-cell monthly totals grid**.
- Optional: a cumulative actual-vs-plan line chart; a "share as image" poster.

**Data:** one committed `data.json`, array of `{ date, distance(km), duration:{hours,mins,secs} }` (running only, filtered distance ≥ 3 km & pace ≤ 8 min/km, deduped per date). Refreshed daily by a **credential-free** `wget`+`jq` GitHub Action pulling `https://zhenghe-md.github.io/running_page/activities.json`. Progression math is portable, dependency-free JS (ported from `equator/src/lib/projection.js`). **The upstream Keep login is never touched** — `running_page`'s published feed is the boundary.

## 12. Screens to mock up first (priority)

1. **Home** (identity + latest strip)
2. **A Writing post** + the Writing index
3. **TIL stream**
4. **Projects gallery** (+ one detail page)
5. **Running dashboard**
6. Talks, About, a category page

## 13. Non-goals / constraints

- No server, no database, no build tooling beyond the tiny content-indexer + the running data-sync Action.
- No heavyweight SSG or front-end framework; pages stay hand/agent-authored HTML with web-component chrome.
- Projects are curated, not auto-listed.
- Nav stays lean; new content types earn a nav slot only when they have volume.

---

## 14. Locked decisions & implementation plan (design → implementation, 2026-07-19)

Recorded after design review. This section is the authoritative input to implementation; where it conflicts with an earlier "open"/"parked" note above, this wins.

### 14.1 Design source of truth
The approved **standalone mockup** (`ZhengHe Site (standalone).html`) is the visual reference. It is a self-extracting bundle; the tokens below are extracted from it and recorded here so this doc stays self-sufficient if the mockup file is lost. *(Open task: vendor a copy of the mockup into `docs/` — pending author's call.)*

### 14.2 Visual layer (resolves §10)
- **Theme-aware**, light + dark, via `[data-theme]` with a nav toggle. Colors in `oklch`. Warm-neutral surfaces + a terracotta/rust accent.
- **Light tokens:** `--bg` `oklch(0.985 0.004 85)` · `--surface` `oklch(0.997 0.003 85)` · `--surface-2` `oklch(0.965 0.005 80)` · `--ink` `oklch(0.24 0.012 55)` · `--muted` `oklch(0.5 0.012 55)` · `--faint` `oklch(0.68 0.01 60)` · `--line` `oklch(0.9 0.006 70)` · `--line-strong` `oklch(0.82 0.008 65)` · `--accent` `oklch(0.55 0.16 34)` · `--accent-ink` `oklch(0.44 0.15 33)` · `--accent-soft` `oklch(0.93 0.035 40)`.
- **Dark tokens:** `--bg` `oklch(0.19 0.008 60)` · `--surface` `oklch(0.225 0.008 60)` · `--surface-2` `oklch(0.26 0.009 60)` · `--ink` `oklch(0.93 0.006 80)` · `--muted` `oklch(0.68 0.008 70)` · `--faint` `oklch(0.52 0.008 60)` · `--line` `oklch(0.31 0.008 60)` · `--line-strong` `oklch(0.38 0.009 60)` · `--accent` `oklch(0.7 0.15 42)` · `--accent-ink` `oklch(0.78 0.14 45)` · `--accent-soft` `oklch(0.32 0.05 40)`.
- **Typography:** `Noto Serif SC` (headings + long-form body, weights 600/700) · `Noto Sans SC` (UI text) · `IBM Plex Mono` (meta, labels, code). Latin nav/eyebrow labels are uppercase mono with letter-spacing.
- **Layout:** centered container `max-width: 1120px`, padding `0 28px`; sticky blurred header (~66px); long-form reading measure ~`720px` (About ~`680px`, prose `line-height` ~1.95); card radii 12–18px; subtle `--shadow` tokens per theme.
- **Per-collection voice (from mockup):** Writing = chronological rows (date · category chip · read-time · summary); TIL = vertical timeline of dot-marked cards; Projects = 2-col poster cards; Talks = wide media+text cards; Running = hero progress card + 3-col year cards.

### 14.3 Fonts
**Self-hosted, subsetted** `Noto Serif SC` / `Noto Sans SC` / `IBM Plex Mono` (no Google Fonts CDN). Subsetting must cover the migrated content's glyphs.

### 14.4 Chrome & build model
- **Shared chrome as web components** (`site-nav`, `site-footer`) + one shared stylesheet + shared feature scripts (image zoom, code styling, MathJax, theme toggle, CF beacon). No per-page chrome duplication.
- **Indexer:** Node.js. Scans content folders, reads each page's embedded metadata, generates all aggregates (Home latest strip, section indexes, `/categories/<name>/`, Atom feed) and the old-link forwarder stubs. **Read-only on content pages.**
- **Deploy:** a **GitHub Action builds the aggregates and deploys** via Pages on push. Contributors commit **only content** — generated files are not committed. `.nojekyll` at root; served at `https://zhenghe-md.github.io/`.
- Metadata convention: embedded `<meta name="category|date|summary|mathjax">` (+ title) per page.

### 14.5 Integrations & contact
- **Analytics:** Cloudflare Web Analytics — see §8.
- **Comments:** Giscus — requires the author to enable **Discussions** on the repo and install the **giscus** app (repo/category IDs); wired as placeholders until then.
- **Contact email:** `ranchardzheng@gmail.com` (replaces the mockup placeholder `hi@zhenghe.dev` in Home, About, footer).

### 14.6 Running data
From `running_page`'s published `activities.json` via a **credential-free** `wget`+`jq` GitHub Action; `projection.js` ported from `equator` to vanilla JS; a seed `data.json` committed. *(Open task: confirm the feed URL actually publishes — not present locally.)*

### 14.7 Scope & phased plan
Scope: **everything end-to-end** — chrome + indexer + all 8 section types + 49-post migration + `equator`→vanilla running port + running-sync Action + old-link stubs + Atom feed.

| Phase | Delivers | Checkpoint |
|---|---|---|
| **0 · Foundation** | Repo layout, `.nojekyll`, shared CSS (tokens + light/dark), self-hosted subsetted fonts, `site-nav`/`site-footer` web components, metadata convention | — |
| **1 · Vertical slice** | Node indexer + Home + Writing index + one real migrated post, rendering through real chrome & indexer | **🚦 Author review gate before scaling** |
| **2 · Writing migration** | All 49 posts md→html (date, `<!--more-->`→summary, mathjax flag, code highlighting, image zoom, ~220 assets), old `/blog/...` stubs, category pages, Atom feed | **📋 Per-post category mapping table for review** |
| **3 · Running** | `projection.js`→vanilla, hero progress bar + milestones, year cards (heatmap + monthly grid), seed `data.json`, sync Action | Confirm `running_page` feed URL |
| **4 · Projects · Talks · About** | Curated card galleries + About timelines, Giscus on posts | **✍️ Curated content needed (§14.8)** |
| **5 · Integrations & deploy** | CF beacon, giscus config, mobile nav, theme persistence, deploy Action, end-to-end verify | Enable Discussions + install giscus |

### 14.8 Content the author must supply (curated — not migratable)
- **Projects:** which repos to feature + one-liners (draft from `equator`, `minds`, `badminton`, `quick-translate`, GitHub; author trims/approves).
- **Talks:** list of title / event / date / video (Bilibili·YouTube) / slides links — `machine-talk-slides` is not in the local repos.
- **About:** work history + education — the old `resume` repo is not in the local repos.

Claude will draft plausible first versions from available material; the author corrects at the Phase 4 checkpoint.
