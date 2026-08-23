#!/usr/bin/env node
// Content indexer — the only build step of this site.
//
// Scans content folders, reads each page's embedded metadata, and generates
// all aggregates into _site/: the Home latest strip and tile counts, the
// Writing index list, cross-collection category pages, the
// Atom feed, and old-link forwarder stubs. Content pages are copied verbatim;
// this script never rewrites them in place (the folder is the source of truth).
//
// Usage: node scripts/build.mjs [--out _site]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : '_site');

const SITE_URL = 'https://zhenghe-md.github.io';
const SITE_TITLE = '郑鹤 · ZhengHe';

// 白鹤札记 — see docs/podcast-pipeline.md. The feed URL is the show's permanent
// identity across Apple/Spotify/Overcast; changing it zeroes every subscriber.
const SHOW = {
  title: '白鹤札记',
  url: `${SITE_URL}/podcast/`,
  feed: `${SITE_URL}/podcast/feed.xml`,
  image: `${SITE_URL}/podcast/cover.jpg`,
  author: '郑鹤',
  email: 'ranchardzheng@gmail.com',
  language: 'zh-CN',
  description: '围绕我对这个世界的疑问展开：技术、教育、人性，以及那些还没想明白的事。不限定领域，只跟着问题走。\n\n本节目部分单集由文本转语音技术合成，具体见各单集说明。',
  categories: [['Society & Culture', 'Philosophy'], ['Technology', null]],
};

// ---------------------------------------------------------------- utilities

const read = (p) => fs.readFileSync(p, 'utf8');

function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function meta(html, name) {
  const re = new RegExp(`<meta\\s+name="${name}"\\s+content="([^"]*)"`, 'i');
  const m = html.match(re);
  return m ? m[1] : null;
}

function titleOf(html) {
  const m = html.match(/<title>([^<]*)<\/title>/i);
  if (!m) return null;
  return m[1].replace(/\s*·\s*(郑鹤|白鹤札记)\s*$/, '').trim();
}

function replaceRegion(html, name, replacement) {
  const re = new RegExp(`(<!-- build:${name} -->)[\\s\\S]*?(<!-- /build:${name} -->)`);
  if (!re.test(html)) throw new Error(`region ${name} not found`);
  return html.replace(re, `$1\n${replacement}\n$2`);
}

// Reading time: CJK chars count 1, latin words count 1; ~400/min.
function readMinutes(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ');
  const cjk = (text.match(/[一-鿿]/g) || []).length;
  const words = (text.match(/[A-Za-z0-9]+/g) || []).length;
  return Math.max(1, Math.round((cjk + words) / 400));
}

function sessionCount(html) {
  const metaSessions = meta(html, 'sessions');
  if (metaSessions) return Number(metaSessions);
  const matches = [...html.matchAll(/"path"\s*:\s*"[^"]+\.html"/g)];
  if (matches.length > 0) return matches.length;
  return null;
}

// ---------------------------------------------------------------- scan

function scanCollection(dir) {
  const base = path.join(ROOT, dir);
  if (!fs.existsSync(base)) return [];
  const items = [];
  for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const page = path.join(base, entry.name, 'index.html');
    if (!fs.existsSync(page)) continue;
    const html = read(page);
    items.push({
      collection: dir,
      slug: entry.name,
      url: `/${dir}/${entry.name}/`,
      title: titleOf(html) || entry.name,
      date: meta(html, 'date') || '1970-01-01',
      category: meta(html, 'category'),
      summary: meta(html, 'summary') || '',
      legacy: meta(html, 'legacy'),
      minutes: readMinutes(html),
      guid: meta(html, 'guid'),
      audioUrl: meta(html, 'audio-url'),
      audioBytes: Number(meta(html, 'audio-bytes') || 0),
      audioDuration: Number(meta(html, 'audio-duration') || 0),
      synthesized: meta(html, 'synthesized') === 'true',
      sessions: sessionCount(html),
      html,
    });
  }
  items.sort((a, b) => b.date.localeCompare(a.date));
  return items;
}

// ---------------------------------------------------------------- copy tree

function copySite() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const skip = new Set(['_site', '.git', 'node_modules', 'scripts', 'docs', '.github', 'workers']);
  for (const entry of fs.readdirSync(ROOT)) {
    if (skip.has(entry) || entry.startsWith('.') && entry !== '.nojekyll') continue;
    fs.cpSync(path.join(ROOT, entry), path.join(OUT, entry), {
      recursive: true,
      // Audio is served from R2 and the chunk cache and music bed are working
      // files — none of them belong in the published site. Download counts are the
      // author's record, not the Show's: publishing them is a separate decision.
      filter: (src) => {
        const rel = path.relative(ROOT, src);
        return !(rel.includes(`${path.sep}.cache`) || rel.endsWith(`${path.sep}audio.mp3`)
          || rel.endsWith(`${path.sep}cover.png`)
          || rel === path.join('podcast', 'stats.json')
          || rel === path.join('podcast', 'music') || rel.startsWith(path.join('podcast', 'music') + path.sep));
      },
    });
  }
  if (fs.existsSync(path.join(ROOT, '.nojekyll'))) {
    fs.copyFileSync(path.join(ROOT, '.nojekyll'), path.join(OUT, '.nojekyll'));
  }
}

// ---------------------------------------------------------------- renderers

function latestRow(item) {
  const typeLabel = { writing: '写作', courses: '课程', projects: '项目', talks: '演讲' }[item.collection] || item.collection;
  return `<a class="latest-item" href="${item.url}">
  <span class="chip">${esc(typeLabel)}</span>
  <div><div class="t">${esc(item.title)}</div><div class="s">${esc(item.summary)}</div></div>
  <span class="d">${esc(item.date.slice(5))}</span>
</a>`;
}

function truncate(s, n) {
  s = String(s ?? '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function postRow(p) {
  const cat = p.category
    ? `<span class="chip cat">${esc(p.category)}</span>` : '';
  return `<a class="post-row" data-cat="${esc(p.category || '')}" href="${p.url}">
  <div class="date">${esc(p.date)}</div>
  <div>
    <div class="meta-line">${cat}<span class="read-time">${p.minutes} min</span></div>
    <h3>${esc(p.title)}</h3>
    <p>${esc(p.summary)}</p>
  </div>
</a>`;
}

function courseCard(c) {
  const cat = c.category
    ? `<span class="chip cat">${esc(c.category)}</span>`
    : `<span class="chip">课程</span>`;
  const sessionsText = c.sessions ? `${c.sessions} 课时` : '';
  return `<a class="course-card" href="${c.url}">
  <div class="head-bar">
    ${cat}
    ${sessionsText ? `<span class="sessions-badge">${esc(sessionsText)}</span>` : ''}
  </div>
  <div class="body">
    <h3>${esc(c.title)}</h3>
    <p class="desc">${esc(c.summary)}</p>
  </div>
  <div class="meta-foot">
    <span>${esc(c.date)}</span>
    <span class="action">进入课程 →</span>
  </div>
</a>`;
}

function categoryPage(name, items) {
  const rows = items.map(latestRow).join('\n');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(name)} · 郑鹤</title>
<meta name="description" content="类目「${esc(name)}」下的全部内容。">
<link rel="stylesheet" href="/assets/css/site.css">
<link rel="alternate" type="application/atom+xml" title="${SITE_TITLE}" href="/feed.xml">
<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
<script src="/assets/js/site.js"></script>
</head>
<body>
<site-nav></site-nav>
<main class="container">
  <section class="page-head">
    <div class="eyebrow">Category</div>
    <h1>${esc(name)}</h1>
    <p class="lede">跨越所有栏目的「${esc(name)}」内容，共 ${items.length} 篇。</p>
  </section>
  <section class="latest" style="padding-top:8px;">
${rows}
  </section>
</main>
<site-footer></site-footer>
</body>
</html>
`;
}

function forwarderStub(oldPath, newUrl) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0; url=${newUrl}">
<link rel="canonical" href="${SITE_URL}${newUrl}">
<title>已迁移</title>
</head>
<body>
<p>此页面已迁移至 <a href="${newUrl}">${SITE_URL}${newUrl}</a></p>
</body>
</html>
`;
}

function hhmmss(total) {
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function episodeRow(e) {
  return `<a class="episode-row" href="${e.url}">
  <div class="date">${esc(e.date)}</div>
  <div><div class="t">${esc(e.title)}</div><div class="s">${esc(truncate(e.summary, 110))}</div></div>
  <div class="dur">${hhmmss(e.audioDuration)}</div>
</a>`;
}

function rfc822(date) {
  return new Date(`${date}T08:00:00+08:00`).toUTCString();
}

function podcastFeed(episodes) {
  const cats = SHOW.categories.map(([top, sub]) => sub
    ? `    <itunes:category text="${esc(top)}"><itunes:category text="${esc(sub)}"/></itunes:category>`
    : `    <itunes:category text="${esc(top)}"/>`).join('\n');

  const items = episodes.filter(e => e.audioUrl).map((e) => {
    const disclosure = e.synthesized ? '\n\n本集音频由文本转语音技术合成。' : '';
    const desc = `${e.summary}${disclosure}`;
    const cover = fs.existsSync(path.join(ROOT, 'podcast', e.slug, 'cover.jpg'))
      ? `\n      <itunes:image href="${SITE_URL}/podcast/${e.slug}/cover.jpg"/>` : '';
    return `    <item>
      <title>${esc(e.title)}</title>
      <link>${SITE_URL}${e.url}</link>
      <guid isPermaLink="false">${esc(e.guid || e.slug)}</guid>
      <pubDate>${rfc822(e.date)}</pubDate>
      <description>${esc(desc)}</description>
      <itunes:summary>${esc(desc)}</itunes:summary>
      <enclosure url="${esc(e.audioUrl)}" length="${e.audioBytes}" type="audio/mpeg"/>
      <itunes:duration>${hhmmss(e.audioDuration)}</itunes:duration>
      <itunes:explicit>false</itunes:explicit>${cover}
    </item>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"
     xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
     xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(SHOW.title)}</title>
    <link>${SHOW.url}</link>
    <atom:link href="${SHOW.feed}" rel="self" type="application/rss+xml"/>
    <language>${SHOW.language}</language>
    <description>${esc(SHOW.description)}</description>
    <itunes:author>${esc(SHOW.author)}</itunes:author>
    <itunes:summary>${esc(SHOW.description)}</itunes:summary>
    <itunes:owner>
      <itunes:name>${esc(SHOW.author)}</itunes:name>
      <itunes:email>${esc(SHOW.email)}</itunes:email>
    </itunes:owner>
    <itunes:image href="${SHOW.image}"/>
${cats}
    <itunes:explicit>false</itunes:explicit>
    <itunes:type>episodic</itunes:type>
${items}
  </channel>
</rss>
`;
}

function atomFeed(items) {
  const updated = items.length ? `${items[0].date}T00:00:00Z` : new Date().toISOString();
  const entries = items.map((it) => `  <entry>
    <title>${esc(it.title)}</title>
    <link href="${SITE_URL}${it.url}"/>
    <id>${SITE_URL}${it.url}</id>
    <updated>${it.date}T00:00:00Z</updated>
    <summary>${esc(it.summary)}</summary>
    ${it.category ? `<category term="${esc(it.category)}"/>` : ''}
  </entry>`).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${SITE_TITLE}</title>
  <link href="${SITE_URL}/"/>
  <link rel="self" href="${SITE_URL}/feed.xml"/>
  <id>${SITE_URL}/</id>
  <updated>${updated}</updated>
  <author><name>郑鹤</name></author>
${entries}
</feed>
`;
}

// ---------------------------------------------------------------- build

export function build(opts = {}) {
  const verbose = opts.verbose ?? true;

  copySite();

  const writing = scanCollection('writing');
  const courses = scanCollection('courses');
  const podcast = scanCollection('podcast');

  // counts for home tiles
  let runningKm = '—';
  const dataPath = path.join(ROOT, 'running', 'data.json');
  if (fs.existsSync(dataPath)) {
    const activities = JSON.parse(read(dataPath));
    const total = activities.reduce((s, a) => s + (a.distance || 0), 0);
    runningKm = Math.round(total).toLocaleString('en-US');
  }
  // Count cards in the curated galleries. Comments are stripped first so the
  // commented-out "copy me" card templates don't inflate the counts.
  function countCards(file, cls) {
    const p = path.join(ROOT, file, 'index.html');
    if (!fs.existsSync(p)) return 0;
    const live = read(p).replace(/<!--[\s\S]*?-->/g, '');
    return (live.match(new RegExp(`class="${cls}"`, 'g')) || []).length;
  }
  const projectsCount = countCards('projects', 'project-card');
  const talksCount = countCards('talks', 'talk-card');

  // home
  {
    let home = read(path.join(ROOT, 'index.html'));
    const latest = [...writing, ...courses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
    home = replaceRegion(home, 'latest', latest.map(latestRow).join('\n'));
    home = replaceRegion(home, 'count:writing', `${writing.length} posts`);
    home = replaceRegion(home, 'count:courses', `${courses.length} courses`);
    home = replaceRegion(home, 'count:projects', `${projectsCount} works`);
    home = replaceRegion(home, 'count:talks', `${talksCount} talks`);
    home = replaceRegion(home, 'count:running', `${runningKm} km`);
    fs.writeFileSync(path.join(OUT, 'index.html'), home);
  }

  // writing index
  {
    let page = read(path.join(ROOT, 'writing', 'index.html'));
    page = replaceRegion(page, 'writing-list', writing.map(postRow).join('\n'));
    fs.writeFileSync(path.join(OUT, 'writing', 'index.html'), page);
  }

  // courses index
  {
    let page = read(path.join(ROOT, 'courses', 'index.html'));
    const cards = courses.length
      ? courses.map(courseCard).join('\n')
      : '<p style="color:var(--muted);grid-column:1/-1;padding:20px 0;">课程正在编排中，敬请期待。</p>';
    page = replaceRegion(page, 'courses-list', cards);
    fs.writeFileSync(path.join(OUT, 'courses', 'index.html'), page);
  }

  // podcast index + RSS feed
  {
    const src = path.join(ROOT, 'podcast', 'index.html');
    if (fs.existsSync(src)) {
      let page = read(src);
      const rows = podcast.length
        ? podcast.map(episodeRow).join('\n')
        : '<p style="color:var(--muted);padding:20px 0;">第一期正在录制中。</p>';
      page = replaceRegion(page, 'podcast-list', rows);
      fs.writeFileSync(path.join(OUT, 'podcast', 'index.html'), page);
      fs.writeFileSync(path.join(OUT, 'podcast', 'feed.xml'), podcastFeed(podcast));
    }
  }

  // category pages (site-wide taxonomy: 思考 / 实践)
  {
    const byCat = new Map();
    for (const item of [...writing, ...courses]) {
      if (!item.category) continue;
      if (!byCat.has(item.category)) byCat.set(item.category, []);
      byCat.get(item.category).push(item);
    }
    for (const [name, items] of byCat) {
      items.sort((a, b) => b.date.localeCompare(a.date));
      const dir = path.join(OUT, 'categories', name);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'index.html'), categoryPage(name, items));
    }
  }

  // atom feed
  {
    const items = [...writing, ...courses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
    fs.writeFileSync(path.join(OUT, 'feed.xml'), atomFeed(items));
  }

  // old-link forwarder stubs (from each page's own legacy meta), plus the old
  // blog's own landing pages. These only take effect once the ZhengHe-MD/blog
  // project site stops shadowing /blog/ — see README.
  {
    let stubs = 0;
    const writeStub = (oldPath, newUrl) => {
      const rel = oldPath.replace(/^\//, '').replace(/\/$/, '');
      const dir = path.join(OUT, rel);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'index.html'), forwarderStub(oldPath, newUrl));
      stubs += 1;
    };

    for (const item of [...writing, ...courses]) {
      if (item.legacy) writeStub(item.legacy, item.url);
    }
    writeStub('/til/', '/writing/');
    writeStub('/blog/', '/writing/');
    writeStub('/blog/about/', '/about/');
    writeStub('/blog/categories/', '/writing/');
    writeStub('/blog/tags/', '/writing/');

    if (verbose) console.log(`stubs: ${stubs}`);
  }

  if (verbose) {
    console.log(`writing: ${writing.length}, courses: ${courses.length}, podcast: ${podcast.length}, projects: ${projectsCount}, talks: ${talksCount}, running: ${runningKm} km`);
    console.log(`built → ${OUT}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--watch') || process.argv.includes('-w')) {
    import('./dev.mjs');
  } else {
    build();
  }
}

