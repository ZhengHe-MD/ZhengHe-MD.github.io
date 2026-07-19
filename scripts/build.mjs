#!/usr/bin/env node
// Content indexer — the only build step of this site.
//
// Scans content folders, reads each page's embedded metadata, and generates
// all aggregates into _site/: the Home latest strip and tile counts, the
// Writing index list, the TIL stream, cross-collection category pages, the
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
  return m[1].replace(/\s*·\s*郑鹤\s*$/, '').trim();
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
  const skip = new Set(['_site', '.git', 'node_modules', 'scripts', 'docs', '.github']);
  for (const entry of fs.readdirSync(ROOT)) {
    if (skip.has(entry) || entry.startsWith('.') && entry !== '.nojekyll') continue;
    fs.cpSync(path.join(ROOT, entry), path.join(OUT, entry), { recursive: true });
  }
  if (fs.existsSync(path.join(ROOT, '.nojekyll'))) {
    fs.copyFileSync(path.join(ROOT, '.nojekyll'), path.join(OUT, '.nojekyll'));
  }
}

// ---------------------------------------------------------------- renderers

function latestRow(item) {
  const typeLabel = { writing: '写作', til: 'TIL', projects: '项目', talks: '演讲' }[item.collection] || item.collection;
  const sub = item.collection === 'writing' && item.category
    ? `${item.category} · ${item.summary}` : item.summary;
  return `<a class="latest-item" href="${item.url}">
  <span class="chip">${esc(typeLabel)}</span>
  <div><div class="t">${esc(item.title)}</div><div class="s">${esc(truncate(sub, 60))}</div></div>
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

function tilStreamEntry(t) {
  const bodyMatch = t.html.match(/<!-- til:body -->([\s\S]*?)<!-- \/til:body -->/);
  const body = bodyMatch ? bodyMatch[1].trim() : `<p class="body">${esc(t.summary)}</p>`;
  return `<div class="til-entry">
  <span class="dot"></span>
  <div class="date">${esc(t.date)}</div>
  <div class="til-card">
    <h3><a href="${t.url}">${esc(t.title)}</a></h3>
    ${body}
  </div>
</div>`;
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

copySite();

const writing = scanCollection('writing');
const til = scanCollection('til');

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
  const latest = [...writing, ...til].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  home = replaceRegion(home, 'latest', latest.map(latestRow).join('\n'));
  home = replaceRegion(home, 'count:writing', `${writing.length} posts`);
  home = replaceRegion(home, 'count:til', `${til.length} notes`);
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

// til stream
{
  let page = read(path.join(ROOT, 'til', 'index.html'));
  page = replaceRegion(page, 'til-stream', til.map(tilStreamEntry).join('\n'));
  fs.writeFileSync(path.join(OUT, 'til', 'index.html'), page);
}

// category pages (site-wide taxonomy: 思考 / 实践)
{
  const byCat = new Map();
  for (const item of [...writing, ...til]) {
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
  const items = [...writing, ...til].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
  fs.writeFileSync(path.join(OUT, 'feed.xml'), atomFeed(items));
}

// old-link forwarder stubs (from each page's own legacy meta)
{
  let stubs = 0;
  for (const item of [...writing, ...til]) {
    if (!item.legacy) continue;
    const rel = item.legacy.replace(/^\//, '').replace(/\/$/, '');
    const dir = path.join(OUT, rel);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), forwarderStub(item.legacy, item.url));
    stubs += 1;
  }
  console.log(`stubs: ${stubs}`);
}

console.log(`writing: ${writing.length}, til: ${til.length}, projects: ${projectsCount}, talks: ${talksCount}, running: ${runningKm} km`);
console.log(`built → ${OUT}`);
