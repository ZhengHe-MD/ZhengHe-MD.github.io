#!/usr/bin/env node
// Syncs Markdown drafts (draft.md) into standalone HTML manuscript (index.html)
//
// Usage:
//   node scripts/sync-draft.mjs [path/to/draft.md]
//   node scripts/sync-draft.mjs (syncs all draft.md in writing/ and courses/)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Configure marked
marked.setOptions({
  gfm: true,
  breaks: false,
});

function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };

  const metaStr = match[1];
  const body = match[2];
  const meta = {};

  for (const line of metaStr.split('\n')) {
    const idx = line.indexOf(':');
    if (idx !== -1) {
      const key = line.slice(0, idx).trim();
      let val = line.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      meta[key] = val;
    }
  }

  return { meta, body };
}

function cleanExcerpt(text) {
  return text
    .replace(/^#+\s+.*$/gm, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\(.*?\)/g, '$1')
    .replace(/[`*_~#$]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function syncDraft(draftPath) {
  const absDraft = path.isAbsolute(draftPath) ? draftPath : path.resolve(ROOT, draftPath);
  if (!fs.existsSync(absDraft)) {
    console.error(`[sync-draft] File not found: ${absDraft}`);
    return false;
  }

  const dir = path.dirname(absDraft);
  const indexPath = path.join(dir, 'index.html');
  const raw = fs.readFileSync(absDraft, 'utf8');

  let { meta, body } = parseFrontmatter(raw);

  // Check if first line is H1 title (# Title)
  let titleFromH1 = null;
  const h1Match = body.match(/^\s*#\s+(.+)$/m);
  if (h1Match) {
    titleFromH1 = h1Match[1].trim();
    // Remove the first # Title from the body to avoid duplicating it inside .prose
    body = body.replace(/^\s*#\s+.+$/m, '').trim();
  }

  const title = meta.title || titleFromH1;
  const date = meta.date || new Date().toISOString().slice(0, 10);
  const category = meta.category || '思考';
  const hasMath = meta.mathjax === 'true' || meta.mathjax === true || body.includes('$');

  let summary = meta.summary || meta.description;
  if (!summary) {
    const paragraphs = body.split(/\n\s*\n/).map(cleanExcerpt).filter(Boolean);
    if (paragraphs.length > 0) {
      summary = paragraphs[0].slice(0, 200);
    }
  }

  const renderedHtml = marked.parse(body);
  const indentedHtml = renderedHtml
    .split('\n')
    .map((line) => (line ? `    ${line}` : ''))
    .join('\n');

  if (fs.existsSync(indexPath)) {
    let html = fs.readFileSync(indexPath, 'utf8');

    // Replace prose content
    const proseRe = /(<div class="prose">)[\s\S]*?(<\/div>\s*<\/article>)/i;
    if (proseRe.test(html)) {
      html = html.replace(proseRe, `$1\n${indentedHtml}\n    $2`);
    } else {
      console.warn(`[sync-draft] Could not find <div class="prose"> in ${indexPath}`);
    }

    // Update metadata if specified
    if (title) {
      html = html.replace(/<title>([^<]*)<\/title>/i, `<title>${esc(title)} · 郑鹤</title>`);
      html = html.replace(/<h1 class="title">([^<]*)<\/h1>/i, `<h1 class="title">${esc(title)}</h1>`);
    }
    if (summary) {
      html = html.replace(/(<meta\s+name="summary"\s+content=")[^"]*(")/i, `$1${esc(summary)}$2`);
      html = html.replace(/(<meta\s+name="description"\s+content=")[^"]*(")/i, `$1${esc(summary)}$2`);
    }
    if (meta.date) {
      html = html.replace(/(<meta\s+name="date"\s+content=")[^"]*(")/i, `$1${esc(meta.date)}$2`);
      html = html.replace(/(<span class="when">)[^<]*(<\/span>)/i, `$1${esc(meta.date)}$2`);
    }
    if (meta.category) {
      html = html.replace(/(<meta\s+name="category"\s+content=")[^"]*(")/i, `$1${esc(meta.category)}$2`);
      html = html.replace(/(<a class="chip cat" href="\/categories\/[^/]+\/">)[^<]*(<\/a>)/i,
        `<a class="chip cat" href="/categories/${encodeURIComponent(meta.category)}/">${esc(meta.category)}</a>`);
    }
    if (hasMath && !html.includes('<meta name="mathjax"')) {
      html = html.replace(/(<meta\s+name="category"[^>]*>)/i, `$1\n<meta name="mathjax" content="true">`);
    }

    fs.writeFileSync(indexPath, html, 'utf8');
    console.log(`[sync-draft] Synced ${path.relative(ROOT, absDraft)} → ${path.relative(ROOT, indexPath)}`);
  } else {
    // Generate new standalone HTML file
    const catUrl = encodeURIComponent(category);
    const newHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title || '新博文')} · 郑鹤</title>
<meta name="date" content="${esc(date)}">
<meta name="category" content="${esc(category)}">
<meta name="summary" content="${esc(summary || '')}">
<meta name="description" content="${esc(summary || '')}">
${hasMath ? '<meta name="mathjax" content="true">\n' : ''}<link rel="stylesheet" href="/assets/css/site.css">
<link rel="alternate" type="application/atom+xml" title="郑鹤 · ZhengHe" href="/feed.xml">
<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
<script src="/assets/js/site.js"></script>
</head>
<body>
<site-nav active="writing"></site-nav>

<main class="container">
  <article class="post">
    <a class="back" href="/writing/">← 写作</a>
    <div class="meta-line">
      <a class="chip cat" href="/categories/${catUrl}/">${esc(category)}</a>
      <span class="when">${esc(date)}</span>
    </div>
    <h1 class="title">${esc(title || '新博文')}</h1>
    <div class="prose">
${indentedHtml}
    </div>
  </article>
  <div class="post-comments">
    <div class="label">COMMENTS · GISCUS</div>
    <div class="giscus-placeholder">giscus · GitHub Discussions</div>
  </div>
</main>

<site-footer></site-footer>
</body>
</html>
`;
    fs.writeFileSync(indexPath, newHtml, 'utf8');
    console.log(`[sync-draft] Created new ${path.relative(ROOT, indexPath)} from draft`);
  }

  return true;
}

// CLI runner
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const target = process.argv[2];
  if (target) {
    syncDraft(target);
  } else {
    // Scan all draft.md in writing
    const writingDir = path.join(ROOT, 'writing');
    if (fs.existsSync(writingDir)) {
      for (const entry of fs.readdirSync(writingDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const d = path.join(writingDir, entry.name, 'draft.md');
        if (fs.existsSync(d)) {
          syncDraft(d);
        }
      }
    }
  }
}
