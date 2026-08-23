#!/usr/bin/env node
// Authoring pipeline for the Podcast collection (白鹤札记).
//
// Speech Script -> chunks -> 火山引擎 TTS -> ffmpeg concat + loudnorm -> episode page.
// Run by hand: it needs API credentials and costs money. Never part of `npm run build`.
//
// Usage:
//   node scripts/podcast.mjs draft <episode-slug> --from-writing <writing-slug>
//   node scripts/podcast.mjs synth <episode-slug>
//   node scripts/podcast.mjs page  <episode-slug>
//   node scripts/podcast.mjs all   <episode-slug>
//   node scripts/podcast.mjs stats [--days <n>] [--dry-run]

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------- synthesis parameters (see docs/podcast-pipeline.md) ----------

const TTS_URL = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional';
const RESOURCE_ID = 'seed-tts-2.0';
const SPEAKER = 'zh_male_yuanboxiaoshu_uranus_bigtts'; // 渊博小叔 2.0
const SAMPLE_RATE = 24000;                             // model-native; ffmpeg resamples once at the end
const MAX_CHUNK_CHARS = 600;
const VOICE_LUFS = -16;   // podcast standard, mono
const MUSIC_LUFS = -20;   // bed level while at full volume (intro / outro)
const LIMIT_TP = 0.794;   // -2 dBFS ceiling, leaving headroom for MP3 encode overshoot

// Gaps are cut locally from PCM silence, not requested from the API, so retuning
// them costs nothing — they are deliberately excluded from the chunk hash.
const TITLE_GAP_MS = 1200;
const PARAGRAPH_GAP_MS = 800;
// The voice ends its last sentence with almost no decay. Without a closing gap the
// outro swell starts on top of the final syllable and the episode reads as cut off.
const END_GAP_MS = 1500;

// aigc_watermark is deliberately OFF: it appends ~0.65s of audible marker to the end
// of every request, which lands as a beep at each paragraph seam. The AI-synthesis
// declaration goes into ID3 metadata instead (see writeTags).

// Music bed. Stored on R2 rather than in git, pinned by content hash in
// podcast/music/bed.json so a given commit always renders with the same bed.
// Absent -> narration is published dry.
const MUSIC = ['mp3', 'wav', 'm4a', 'flac'].map(e => `podcast/music/bed.${e}`);
const BED_MANIFEST = 'podcast/music/bed.json';
const BED_CACHE = 'podcast/music/.cache';
const LEAD_IN_S = 8;    // music alone, full volume, before narration
const DUCK_FADE_S = 1.5;
const DUCK = 0.12;      // bed level under narration
const TAIL_FADE_S = 2;
const TAIL_S = 16;      // music alone after narration
const FADE_OUT_S = 5;
const BED_TAIL_TRIM_S = 3;  // drop the bed's own fade-out, so the loop point is at full level
const BED_XFADE_S = 3;      // crossfade loop repeats instead of butt-splicing them

// ---------- helpers ----------

function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) throw new Error('.env not found — see docs/podcast-pipeline.md');
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i !== -1) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return env;
}

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i === -1) continue;
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    meta[line.slice(0, i).trim()] = v;
  }
  return { meta, body: m[2] };
}

function requireEnv(env, keys) {
  for (const k of keys) if (!env[k]) throw new Error(`${k} missing from .env`);
  return env;
}

function episodeDir(slug) {
  return path.join(ROOT, 'podcast', slug);
}

function readEpisode(slug) {
  const file = path.join(episodeDir(slug), 'episode.md');
  if (!fs.existsSync(file)) throw new Error(`not found: ${path.relative(ROOT, file)} — run \`draft\` first`);
  const { meta, body } = parseFrontmatter(fs.readFileSync(file, 'utf8'));
  return { meta, script: body.trim() };
}

// ---------- draft: Writing -> Speech Script scaffold ----------
// One adapter into the pipeline. An Episode need not have a source Writing.

function draft(slug, fromWriting) {
  if (!fromWriting) throw new Error('draft requires --from-writing <writing-slug>');
  const src = path.join(ROOT, 'writing', fromWriting, 'index.html');
  const html = fs.readFileSync(src, 'utf8');

  const prose = html.match(/<div class="prose">([\s\S]*?)<\/div>\s*<\/article>/);
  if (!prose) throw new Error(`no .prose block in ${path.relative(ROOT, src)}`);

  const paragraphs = [...prose[1].matchAll(/<p>([\s\S]*?)<\/p>/g)].map(m => m[1]
    .replace(/<a[^>]*>([\s\S]*?)<\/a>/g, '$1')   // links: anchor text only
    .replace(/<[^>]+>/g, '')
    .replaceAll('&amp;', '&').replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'")
    .trim()
  ).filter(Boolean);

  const title = (html.match(/<h1 class="title">([\s\S]*?)<\/h1>/) || [])[1]?.trim() || fromWriting;
  const date = (html.match(/<meta name="date" content="([^"]*)"/) || [])[1] || '';
  const summary = (html.match(/<meta name="summary" content="([^"]*)"/) || [])[1] || '';

  const out = `---
title: ${title}
date: ${date}
summary: ${summary}
source: /writing/${fromWriting}/
synthesized: true
voice: ${SPEAKER}
---

${paragraphs.join('\n\n')}
`;

  const dir = episodeDir(slug);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'episode.md');
  if (fs.existsSync(file)) throw new Error(`refusing to overwrite ${path.relative(ROOT, file)}`);
  fs.writeFileSync(file, out);

  const chars = paragraphs.join('').length;
  console.log(`[draft] ${path.relative(ROOT, file)} — ${paragraphs.length} paragraphs, ${chars} chars`);
  console.log('[draft] read it through and fix anything that reads badly aloud before running `synth`');
}

// ---------- chunking ----------

function chunk(script, title) {
  const chunks = [];
  if (title) chunks.push({ text: title, gapMs: TITLE_GAP_MS });
  for (const para of script.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean)) {
    const parts = [];
    if (para.length <= MAX_CHUNK_CHARS) {
      parts.push(para);
    } else {
      // only split on sentence boundaries, never mid-sentence
      let buf = '';
      for (const sentence of para.split(/(?<=[。！？；])/)) {
        if (buf && (buf + sentence).length > MAX_CHUNK_CHARS) { parts.push(buf); buf = ''; }
        buf += sentence;
      }
      if (buf) parts.push(buf);
    }
    parts.forEach((text, i) => {
      chunks.push({ text, gapMs: i === parts.length - 1 ? PARAGRAPH_GAP_MS : 0 });
    });
  }
  if (chunks.length) chunks[chunks.length - 1].gapMs = END_GAP_MS;
  return chunks;
}

function silencePcm(ms) {
  return Buffer.alloc(Math.round(SAMPLE_RATE * ms / 1000) * 2); // s16le mono
}

function chunkHash(c) {
  return crypto.createHash('sha256')
    .update(JSON.stringify([c.text, SPEAKER, RESOURCE_ID, SAMPLE_RATE]))
    .digest('hex').slice(0, 16);
}

// ---------- TTS ----------

async function synthesizeChunk(env, c) {
  const res = await fetch(TTS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-App-Id': env.VOLC_APP_ID,
      'X-Api-Access-Key': env.VOLC_ACCESS_KEY,
      'X-Api-Resource-Id': RESOURCE_ID,
      'X-Api-Request-Id': crypto.randomUUID(),
    },
    body: JSON.stringify({
      user: { uid: 'zhenghe' },
      req_params: {
        text: c.text,
        speaker: SPEAKER,
        audio_params: { format: 'pcm', sample_rate: SAMPLE_RATE },
        additions: JSON.stringify({ explicit_language: 'zh-cn' }),
      },
    }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);

  // newline-delimited JSON frames; audio arrives base64 in `data`
  const parts = [];
  for (const line of (await res.text()).split('\n')) {
    if (!line.trim()) continue;
    const frame = JSON.parse(line);
    if (frame.code && frame.code !== 20000000) throw new Error(`${frame.code}: ${frame.message}`);
    if (frame.data) parts.push(Buffer.from(frame.data, 'base64'));
  }
  return Buffer.concat(parts);
}

// loudnorm cannot normalize the finished mix: reaching -16 LUFS from a voice+bed
// mix needs more gain than the true-peak ceiling allows, so ffmpeg silently falls
// back to *dynamic* mode and rides the gain — which pumps a constant bed to
// different levels at the intro and the outro. So each source is normalized on its
// own (where linear mode is achievable), mixed at known levels, then limited.
// loudnorm emits 192kHz, hence the aresample after every instance.
function measureLoudness(inputs, graph, target) {
  const r = spawnSync('ffmpeg', [
    '-hide_banner', '-nostats', ...inputs,
    '-filter_complex', `${graph};[pre]loudnorm=I=${target}:TP=-1.5:LRA=11:print_format=json[o]`,
    '-map', '[o]', '-f', 'null', '-',
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`loudness measurement failed:\n${r.stderr.slice(-500)}`);
  const out = r.stderr;
  return JSON.parse(out.slice(out.lastIndexOf('{'), out.lastIndexOf('}') + 1));
}

function loudnorm(target, m) {
  return `loudnorm=I=${target}:TP=-1.5:LRA=11`
    + `:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}`
    + `:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,aresample=44100`;
}

// The intro/outro bed sits close enough to the voice to drag the gated program
// loudness off target, and how far depends on the music. Rather than guess, measure
// the finished mix and close the gap with one static gain — no dynamics, so the
// intro/outro symmetry established above survives it.
function withMakeup(inputs, graph) {
  const m = measureLoudness(inputs, graph, VOICE_LUFS);
  const gain = (VOICE_LUFS - Number(m.input_i)).toFixed(2);
  console.log(`[synth] program loudness ${m.input_i} LUFS -> makeup ${gain} dB`);
  return `${graph};[pre]volume=${gain}dB,alimiter=limit=${LIMIT_TP}:level=disabled[o]`;
}

function encodeMp3({ inputs, graph, out, meta }) {
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', ...inputs,
    '-filter_complex', graph, '-map', '[o]',
    '-ar', '44100', '-ac', '1', '-b:a', '64k', ...tags(meta), out,
  ], { stdio: 'inherit' });
}

// A bed shorter than the episode has to repeat. Butt-splicing repeats puts an
// audible seam wherever the loop lands; crossfading them does not. The source's own
// fade-out is trimmed first, or the loop point would dip to silence and jump back.
function buildBed(music, usable, total, offset) {
  const step = usable - BED_XFADE_S;
  const copies = usable >= total ? 1 : Math.ceil((total - usable) / step) + 1;
  const parts = [];
  for (let i = 0; i < copies; i++) {
    parts.push(`[${i + offset}:a]atrim=0:${usable.toFixed(3)},asetpts=PTS-STARTPTS[m${i}]`);
  }
  if (copies === 1) {
    parts.push('[m0]anull[bedraw]');
  } else {
    let prev = 'm0';
    for (let i = 1; i < copies; i++) {
      const out = i === copies - 1 ? 'bedraw' : `x${i}`;
      parts.push(`[${prev}][m${i}]acrossfade=d=${BED_XFADE_S}:c1=tri:c2=tri[${out}]`);
      prev = out;
    }
  }
  return { copies, inputs: Array.from({ length: copies }, () => ['-i', music]).flat(), graph: parts.join(';') };
}

function bedDuration(music) {
  return Number(execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', music,
  ], { encoding: 'utf8' }).trim());
}

// Pushes a bed to R2 under a content-addressed key and records it. Run once per
// bed; `synth` then resolves it from the manifest on any machine.
async function pushBed(from) {
  if (!from) throw new Error('bed requires --from <audio file>');
  const env = requireEnv(loadEnv(), [
    'R2_ACCOUNT_ID', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_PUBLIC_BASE',
  ]);
  const src = path.isAbsolute(from) ? from : path.resolve(process.cwd(), from);
  const body = fs.readFileSync(src);
  const sha = crypto.createHash('sha256').update(body).digest('hex');
  const ext = path.extname(src).slice(1).toLowerCase();
  const key = `assets/bed-${sha.slice(0, 8)}.${ext}`;

  await putObject(env, key, body, {
    'content-type': ext === 'mp3' ? 'audio/mpeg' : 'application/octet-stream',
    'cache-control': 'public, max-age=31536000, immutable',
  });

  fs.writeFileSync(path.join(ROOT, BED_MANIFEST),
    JSON.stringify({ key, sha256: sha, bytes: body.length, source: path.basename(src) }, null, 2) + '\n');

  const cache = path.join(ROOT, BED_CACHE);
  fs.mkdirSync(cache, { recursive: true });
  fs.writeFileSync(path.join(cache, path.basename(key)), body);
  console.log(`[bed] ${key} — ${(body.length / 1024 / 1024).toFixed(1)}MB, pinned in ${BED_MANIFEST}`);
}

// Resolves the bed for a render: cached copy if present, otherwise fetched from R2
// and verified against the pinned hash. Falls back to a loose local file.
async function resolveBed() {
  const manifest = path.join(ROOT, BED_MANIFEST);
  if (!fs.existsSync(manifest)) return findMusic();

  const { key, sha256 } = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  const cached = path.join(ROOT, BED_CACHE, path.basename(key));
  if (fs.existsSync(cached)
    && crypto.createHash('sha256').update(fs.readFileSync(cached)).digest('hex') === sha256) {
    return cached;
  }

  const env = requireEnv(loadEnv(), ['R2_PUBLIC_BASE']);
  const url = `${env.R2_PUBLIC_BASE.replace(/\/$/, '')}/${key}`;
  console.log(`[synth] fetching bed ${key}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`bed fetch ${res.status} from ${url}`);
  const body = Buffer.from(await res.arrayBuffer());

  const got = crypto.createHash('sha256').update(body).digest('hex');
  if (got !== sha256) throw new Error(`bed hash mismatch: ${BED_MANIFEST} pins ${sha256}, R2 served ${got}`);

  fs.mkdirSync(path.dirname(cached), { recursive: true });
  fs.writeFileSync(cached, body);
  return cached;
}

function findMusic() {
  for (const rel of MUSIC) {
    const abs = path.join(ROOT, rel);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

// Full volume for the lead-in, ramp down before the voice arrives, hold under it,
// ramp back up when it stops, full volume through the tail.
function bedEnvelope(voiceStart, voiceEnd) {
  const rampIn = voiceStart - DUCK_FADE_S;
  return `if(lt(t,${rampIn}),1,`
       + `if(lt(t,${voiceStart}),1-${1 - DUCK}*(t-${rampIn})/${DUCK_FADE_S},`
       + `if(lt(t,${voiceEnd}),${DUCK},`
       + `if(lt(t,${voiceEnd + TAIL_FADE_S}),${DUCK}+${1 - DUCK}*(t-${voiceEnd})/${TAIL_FADE_S},1))))`;
}

function tags(meta) {
  const out = [
    '-metadata', `title=${meta.title || ''}`,
    '-metadata', 'artist=郑鹤',
    '-metadata', 'album=白鹤札记',
    '-metadata', `date=${meta.date || ''}`,
  ];
  // 隐式标识 per 《人工智能生成合成内容标识办法》 — carried in file metadata, not as audio
  if (meta.synthesized === 'true') {
    out.push('-metadata', 'comment=本集音频由文本转语音技术合成 / AI-synthesized speech');
  }
  return out;
}

async function synth(slug) {
  const env = requireEnv(loadEnv(), ['VOLC_APP_ID', 'VOLC_ACCESS_KEY']);
  const { meta, script } = readEpisode(slug);
  const dir = episodeDir(slug);
  const cache = path.join(dir, '.cache');
  fs.mkdirSync(cache, { recursive: true });

  const spokenTitle = meta.spoken_title || meta.title;
  const chunks = chunk(script, spokenTitle);
  console.log(`[synth] ${chunks.length} chunks, ${chunks.reduce((n, c) => n + c.text.length, 0)} chars`);

  const manifest = [];
  const buffers = [];
  for (const [i, c] of chunks.entries()) {
    const hash = chunkHash(c);
    const file = path.join(cache, `${hash}.pcm`);
    const cached = fs.existsSync(file);
    if (!cached) {
      process.stdout.write(`[synth] ${i + 1}/${chunks.length} (${c.text.length} chars) … `);
      let pcm;
      for (let attempt = 1; ; attempt++) {
        try { pcm = await synthesizeChunk(env, c); break; }
        catch (err) {
          if (attempt >= 3) throw err;
          console.log(`retry ${attempt} (${err.message})`);
          await new Promise(r => setTimeout(r, 2000 * attempt));
        }
      }
      fs.writeFileSync(file, pcm);
      console.log(`${(pcm.length / 1024).toFixed(0)}KB`);
    } else {
      console.log(`[synth] ${i + 1}/${chunks.length} cached`);
    }
    manifest.push({ hash, chars: c.text.length, gapMs: c.gapMs, cached });
    buffers.push(fs.readFileSync(file));
    if (c.gapMs) buffers.push(silencePcm(c.gapMs));
  }

  fs.writeFileSync(path.join(dir, 'chunks.json'), JSON.stringify({
    speaker: SPEAKER, resourceId: RESOURCE_ID, sampleRate: SAMPLE_RATE, chunks: manifest,
  }, null, 2) + '\n');

  // raw PCM concatenates without seams; encode to MP3 exactly once
  const raw = path.join(cache, 'joined.pcm');
  const joined = Buffer.concat(buffers);
  fs.writeFileSync(raw, joined);
  const voiceDur = joined.length / 2 / SAMPLE_RATE;

  const mp3 = path.join(dir, 'audio.mp3');
  const music = await resolveBed();
  const voiceIn = ['-f', 's16le', '-ar', String(SAMPLE_RATE), '-ac', '1', '-i', raw];

  const voiceM = measureLoudness(voiceIn, '[0:a]anull[pre]', VOICE_LUFS);

  if (music) {
    const total = LEAD_IN_S + voiceDur + TAIL_S;
    const usable = Math.max(1, bedDuration(music) - BED_TAIL_TRIM_S);

    // measurement pass: bed only, so its inputs start at index 0
    const bedAlone = buildBed(music, usable, total, 0);
    const shaped = `[bedraw]aresample=44100,aformat=channel_layouts=mono,atrim=0:${total.toFixed(3)}`;
    const bedM = measureLoudness(bedAlone.inputs, `${bedAlone.graph};${shaped}[pre]`, MUSIC_LUFS);

    // real pass: input 0 is the voice, bed copies follow
    const bed = buildBed(music, usable, total, 1);
    const graph = [
      bed.graph,
      `[0:a]aresample=44100,${loudnorm(VOICE_LUFS, voiceM)},adelay=${Math.round(LEAD_IN_S * 1000)}:all=1[v]`,
      `[bedraw]aresample=44100,aformat=channel_layouts=mono,atrim=0:${total.toFixed(3)},`
        + `${loudnorm(MUSIC_LUFS, bedM)},`
        + `volume='${bedEnvelope(LEAD_IN_S, LEAD_IN_S + voiceDur)}':eval=frame,`
        + `afade=t=out:st=${(total - FADE_OUT_S).toFixed(3)}:d=${FADE_OUT_S}[b]`,
      `[v][b]amix=inputs=2:duration=longest:normalize=0[pre]`,
    ].join(';');
    console.log(`[synth] bed: ${path.relative(ROOT, music)} — ${usable.toFixed(1)}s usable, `
      + `${bed.copies}x with ${BED_XFADE_S}s crossfade, duck to ${DUCK}`);
    const inputs = [...voiceIn, ...bed.inputs];
    encodeMp3({ inputs, graph: withMakeup(inputs, graph), out: mp3, meta });
  } else {
    console.log('[synth] no music bed at podcast/music/bed.* — publishing narration dry');
    const graph = `[0:a]${loudnorm(VOICE_LUFS, voiceM)}[pre]`;
    encodeMp3({ inputs: voiceIn, graph: withMakeup(voiceIn, graph), out: mp3, meta });
  }

  const bytes = fs.statSync(mp3).size;
  const duration = Math.round(Number(execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3,
  ], { encoding: 'utf8' }).trim()));

  const contentHash = crypto.createHash('sha256').update(fs.readFileSync(mp3)).digest('hex').slice(0, 8);
  fs.writeFileSync(path.join(dir, 'audio.json'), JSON.stringify({
    file: `${slug}-${contentHash}.mp3`, bytes, duration, contentHash, music: music ? path.basename(music) : null,
  }, null, 2) + '\n');

  console.log(`[synth] ${path.relative(ROOT, mp3)} — ${fmtDuration(duration)}, ${(bytes / 1024 / 1024).toFixed(1)}MB`);
  console.log(`[synth] upload as ${slug}-${contentHash}.mp3`);
}

function fmtDuration(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
           : `${m}:${String(sec).padStart(2, '0')}`;
}

// ---------- cover ----------
// Apple requires square artwork, 1400x1400 minimum, 3000x3000 maximum, and rejects
// submissions without it. Source images stay out of the repo (see .gitignore); the
// compliant JPEG this produces is what the site and feed serve.
function cover(slug, from) {
  if (!from) throw new Error('cover requires --from <image>');
  const src = path.isAbsolute(from) ? from : path.resolve(process.cwd(), from);
  const [w, h] = execFileSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
    '-of', 'csv=p=0:s=x', src,
  ], { encoding: 'utf8' }).trim().split('x').map(Number);

  if (w !== h) throw new Error(`cover must be square, got ${w}x${h}`);
  const size = w >= 3000 ? 3000 : 1400;
  if (w < 1400) {
    console.log(`[cover] WARNING: source is ${w}x${w}, below Apple's 1400 minimum — `
      + `upscaling to 1400, but regenerating natively would be better`);
  }

  const out = slug === 'show'
    ? path.join(ROOT, 'podcast', 'cover.jpg')
    : path.join(episodeDir(slug), 'cover.jpg');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-i', src,
    '-vf', `scale=${size}:${size}:flags=lanczos`, '-q:v', '2', out,
  ], { stdio: 'inherit' });

  console.log(`[cover] ${path.relative(ROOT, out)} — ${size}x${size}, `
    + `${(fs.statSync(out).size / 1024).toFixed(0)}KB`);
  console.log('[cover] check it at 55x55 — that is its real size in a podcast app');
}

// ---------- upload ----------
// R2 speaks the S3 API, which means SigV4. That is ~40 lines of node:crypto, versus
// pulling in the AWS SDK — which this repo, with one devDependency, has no room for.

const sha256hex = (b) => crypto.createHash('sha256').update(b).digest('hex');
const hmac = (key, msg) => crypto.createHmac('sha256', key).update(msg).digest();

async function putObject(env, key, body, extra) {
  const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const region = 'auto', service = 's3';
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256hex(body);
  const uri = `/${env.R2_BUCKET}/${key}`;

  const headers = { ...extra, host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  const names = Object.keys(headers).map(h => h.toLowerCase()).sort();
  const signedHeaders = names.join(';');
  const canonicalHeaders = names.map(n => `${n}:${String(headers[n]).trim()}\n`).join('');
  const canonicalRequest = ['PUT', uri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n');
  let k = hmac(`AWS4${env.R2_SECRET_ACCESS_KEY}`, dateStamp);
  for (const part of [region, service, 'aws4_request']) k = hmac(k, part);
  const signature = crypto.createHmac('sha256', k).update(stringToSign).digest('hex');

  const send = { ...headers };
  delete send.host; // fetch sets it from the URL
  const res = await fetch(`https://${host}${uri}`, {
    method: 'PUT',
    headers: {
      ...send,
      Authorization: `AWS4-HMAC-SHA256 Credential=${env.R2_ACCESS_KEY_ID}/${scope}, `
        + `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body,
  });
  if (!res.ok) throw new Error(`R2 ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

async function upload(slug) {
  const env = requireEnv(loadEnv(), [
    'R2_ACCOUNT_ID', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_PUBLIC_BASE',
  ]);
  const dir = episodeDir(slug);
  const audioFile = path.join(dir, 'audio.json');
  if (!fs.existsSync(audioFile)) throw new Error('audio.json not found — run `synth` first');
  const audio = JSON.parse(fs.readFileSync(audioFile, 'utf8'));

  const body = fs.readFileSync(path.join(dir, 'audio.mp3'));
  if (body.length !== audio.bytes) throw new Error('audio.mp3 does not match audio.json — re-run `synth`');

  // The key carries a content hash, so an object is never rewritten in place and a
  // year-long immutable cache is safe. r2.dev allows no cache *rules* (that needs a
  // custom domain) but does honour per-object metadata.
  // Duration rides along as object metadata so the audio Worker can convert a byte
  // count into seconds of audio without knowing anything about this repo.
  await putObject(env, audio.file, body, {
    'content-type': 'audio/mpeg',
    'cache-control': 'public, max-age=31536000, immutable',
    'x-amz-meta-duration': String(audio.duration),
  });

  // Listener-facing audio goes through the counting Worker when one is configured.
  // R2_PUBLIC_BASE stays the *direct* bucket URL — it is what fetches the music bed,
  // which is a working asset and must not be counted as a download.
  const base = (env.PODCAST_AUDIO_BASE || env.R2_PUBLIC_BASE).replace(/\/$/, '');
  const url = `${base}/${audio.file}`;
  fs.writeFileSync(audioFile, JSON.stringify({ ...audio, url }, null, 2) + '\n');
  console.log(`[upload] ${url}`);
  console.log(`[upload] ${(body.length / 1024 / 1024).toFixed(1)}MB, immutable for 1 year`);
}

// ---------- page ----------

function page(slug) {
  const dir = episodeDir(slug);
  const { meta, script } = readEpisode(slug);
  const audioFile = path.join(dir, 'audio.json');
  if (!fs.existsSync(audioFile)) throw new Error('audio.json not found — run `synth` first');
  const audio = JSON.parse(fs.readFileSync(audioFile, 'utf8'));
  if (!audio.url) throw new Error('audio.json has no url — run `upload` first');

  const paragraphs = script.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
  const disclosure = meta.synthesized === 'true'
    ? '本集由文本转语音技术合成。'
    : '';

  const html = `<!DOCTYPE html>
<html lang="zh-CN">

<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(meta.title)} · 白鹤札记</title>
  <meta name="date" content="${esc(meta.date)}">
  <meta name="summary" content="${esc(meta.summary)}">
  <meta name="description" content="${esc(meta.summary)}">
  <meta name="guid" content="${esc(slug)}">
  <meta name="audio-file" content="${esc(audio.file)}">
  <meta name="audio-url" content="${esc(audio.url)}">
  <meta name="audio-bytes" content="${audio.bytes}">
  <meta name="audio-duration" content="${audio.duration}">
  <meta name="synthesized" content="${esc(meta.synthesized || 'false')}">
  <meta name="voice" content="${esc(meta.voice || '')}">${meta.source ? `
  <meta name="source" content="${esc(meta.source)}">` : ''}
  <link rel="stylesheet" href="/assets/css/site.css">
  <link rel="alternate" type="application/rss+xml" title="白鹤札记" href="/podcast/feed.xml">
  <link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
  <script src="/assets/js/site.js"></script>
</head>

<body>
  <site-nav active="podcast"></site-nav>

  <main class="container">
    <article class="post">
      <a class="back" href="/podcast/">← 白鹤札记</a>
      <div class="meta-line">
        <span class="when">${esc(meta.date)}</span>
        <span class="when">${fmtDuration(audio.duration)}</span>
      </div>
      <h1 class="title">${esc(meta.title)}</h1>
      <p class="episode-summary">${esc(meta.summary)}</p>
      <audio class="episode-audio" controls preload="none" src="${esc(audio.url)}"></audio>
      ${disclosure ? `<p class="episode-disclosure">${esc(disclosure)}</p>` : ''}
      ${meta.source ? `<p class="episode-source">文稿：<a href="${esc(meta.source)}">${esc(meta.title)}</a></p>` : ''}
      <div class="prose">
${paragraphs.map(p => `        <p>${esc(p)}</p>`).join('\n')}
      </div>
    </article>
  </main>

  <site-footer></site-footer>
</body>

</html>
`;

  fs.writeFileSync(path.join(dir, 'index.html'), html);
  console.log(`[page] ${path.relative(ROOT, path.join(dir, 'index.html'))}`);
}

// ---------- stats ----------

// Downloads are *derived*, not measured. The audio Worker records one row per audio
// request and applies no policy; these constants are the reading of the IAB Podcast
// Measurement Technical Guidelines v2.2 that turns rows into downloads. Changing one
// of them re-derives the entire retained window on the next run — which is the whole
// reason the policy lives here and not on the edge. See docs/podcast-analytics.md.
const IAB_MIN_SECONDS = 60;     // a listener must take >= 1 minute of audio to count
const DEDUP_HOURS = 24;         // one listener, one Episode, at most one download
const AE_RETENTION_DAYS = 90;   // Analytics Engine keeps data points for three months
const AE_DATASET = 'podcast_audio_requests';
const AE_ROW_LIMIT = 100000;
const STATS_FILE = 'podcast/stats.json';

// Episodes are encoded at a fixed 64kbps CBR, so bytes convert to seconds exactly.
// Only reached for objects uploaded before `upload` began stamping duration on R2.
const FALLBACK_BYTES_PER_SECOND = 8000;

// Reached the Worker, but not a person pressing play. Filtering here rather than at
// the edge keeps the judgement reversible — the rows survive to be re-examined.
// Deliberately absent: okhttp, stagefright, AppleCoreMedia — those are real players.
const NON_LISTENER = /bot\b|spider|crawler|facebookexternalhit|bingpreview|slurp|ahrefs|semrush|uptimerobot|pingdom|headlesschrome|validator|monitor|curl\/|wget\/|python-requests|go-http-client|libwww-perl|apache-httpclient/i;

function utcDay(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

// Analytics Engine returns ClickHouse DateTime ("2026-08-23 12:34:56"), which is UTC
// but which Date.parse would read as local time. Normalise before parsing.
function parseAEDate(value) {
  const s = String(value);
  return Date.parse(/[Zz]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s.replace(' ', 'T')}Z`);
}

async function queryAE(env, days) {
  const sql = [
    'SELECT timestamp, blob1 AS episode, blob2 AS listener, blob4 AS ua,',
    '  double1 AS bytes, double2 AS size, double3 AS duration, double4 AS status,',
    '  _sample_interval AS samples',
    `FROM ${AE_DATASET}`,
    `WHERE timestamp > NOW() - INTERVAL '${days}' DAY`,
    'ORDER BY timestamp ASC',
    `LIMIT ${AE_ROW_LIMIT}`,
    'FORMAT JSONEachRow',
  ].join('\n');

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.R2_ACCOUNT_ID}/analytics_engine/sql`,
    { method: 'POST', headers: { Authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}` }, body: sql },
  );
  const text = await res.text();
  if (!res.ok) {
    const hint = /unknown table|does not exist|not found/i.test(text)
      ? ` — dataset "${AE_DATASET}" does not exist yet; the first audio request through the Worker creates it`
      : '';
    throw new Error(`Analytics Engine ${res.status}: ${text.slice(0, 300)}${hint}`);
  }

  const rows = text.split('\n').filter(Boolean).map((line) => {
    const r = JSON.parse(line);
    return {
      t: parseAEDate(r.timestamp),
      episode: r.episode,
      listener: r.listener,
      ua: r.ua || '',
      bytes: Number(r.bytes) || 0,
      size: Number(r.size) || 0,
      duration: Number(r.duration) || 0,
      status: Number(r.status) || 0,
      samples: Number(r.samples) || 1,
    };
  });
  if (rows.length >= AE_ROW_LIMIT) {
    throw new Error(`hit the ${AE_ROW_LIMIT}-row query limit — re-run with a shorter --days window`);
  }
  return rows;
}

// Requests are accumulated, not judged one at a time, because real clients fetch in
// pieces: three 25-second range requests are one download, not zero and not three.
function countDownloads(rows) {
  const byListener = new Map();
  for (const r of rows) {
    if (r.status !== 200 && r.status !== 206) continue;
    if (NON_LISTENER.test(r.ua)) continue;
    const key = `${r.episode} ${r.listener}`;
    let list = byListener.get(key);
    if (!list) byListener.set(key, list = []);
    list.push(r);   // `rows` arrives sorted by timestamp, so each list is too
  }

  const dedupMs = DEDUP_HOURS * 3600 * 1000;
  const downloads = [];
  for (const reqs of byListener.values()) {
    let acc = 0, accStart = 0, countedUntil = 0;
    for (const r of reqs) {
      if (r.t < countedUntil) continue;                         // inside the 24h shadow
      if (r.t - accStart > dedupMs) { acc = 0; accStart = r.t; } // stale partial listen
      acc += r.bytes;
      const perSecond = r.duration > 0 ? r.size / r.duration : FALLBACK_BYTES_PER_SECOND;
      if (acc >= IAB_MIN_SECONDS * perSecond) {
        downloads.push({ episode: r.episode, at: r.t });
        countedUntil = r.t + dedupMs;
        acc = 0;
        accStart = r.t;
      }
    }
  }
  return downloads;
}

// Days at or after `fromDay` are replaced by the fresh derivation; earlier days are
// carried over untouched. That is what makes the committed file outlive Analytics
// Engine's 90-day retention, and what makes re-running this command idempotent.
function mergeStats(existing, fresh, fromDay) {
  const episodes = {};
  const slugs = new Set([...Object.keys(existing.episodes || {}), ...Object.keys(fresh)]);
  for (const slug of [...slugs].sort()) {
    const daily = {};
    for (const [day, n] of Object.entries(existing.episodes?.[slug]?.daily || {})) {
      if (day < fromDay) daily[day] = n;
    }
    Object.assign(daily, fresh[slug] || {});
    const sorted = Object.fromEntries(Object.entries(daily).sort(([a], [b]) => a.localeCompare(b)));
    episodes[slug] = { total: Object.values(sorted).reduce((a, b) => a + b, 0), daily: sorted };
  }
  return episodes;
}

async function stats({ days, dryRun }) {
  const env = requireEnv(loadEnv(), ['R2_ACCOUNT_ID', 'CF_ANALYTICS_TOKEN']);
  const window = Math.min(Math.max(Number(days) || AE_RETENTION_DAYS, 1), AE_RETENTION_DAYS);

  // One extra day of lead-in: a download can be assembled from requests that began
  // before the reporting window opens, and its 24h shadow reaches back over the edge.
  const rows = await queryAE(env, window + 1);
  console.log(`[stats] ${rows.length} audio requests in the last ${window} days`);
  if (!rows.length) return;

  if (rows.some(r => r.samples > 1)) {
    console.warn('[stats] Analytics Engine is sampling this dataset — counts are floors, not exact');
  }

  const fromDay = utcDay(Date.now() - window * 86400000);
  const fresh = {};
  for (const d of countDownloads(rows)) {
    const day = utcDay(d.at);
    if (day < fromDay) continue;                  // belongs to an already-final day
    fresh[d.episode] ??= {};
    fresh[d.episode][day] = (fresh[d.episode][day] || 0) + 1;
  }

  const file = path.join(ROOT, STATS_FILE);
  const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const episodes = mergeStats(existing, fresh, fromDay);

  for (const [slug, e] of Object.entries(episodes)) {
    const recent = Object.entries(e.daily).filter(([d]) => d >= fromDay)
      .reduce((a, [, n]) => a + n, 0);
    console.log(`[stats] ${slug} — ${e.total} downloads total, ${recent} in window`);
  }

  if (dryRun) { console.log('[stats] --dry-run: nothing written'); return; }

  const out = {
    _comment: 'Derived by `node scripts/podcast.mjs stats` from Analytics Engine, which retains '
      + `${AE_RETENTION_DAYS} days. Days before "derivedFrom" were carried over from earlier runs `
      + 'and this file is the only record of them that exists — do not delete it.',
    generatedAt: new Date().toISOString(),
    derivedFrom: fromDay,
    rules: { minSeconds: IAB_MIN_SECONDS, dedupHours: DEDUP_HOURS, standard: 'IAB Podcast Measurement v2.2' },
    episodes,
  };
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
  console.log(`[stats] wrote ${STATS_FILE}`);
}

// ---------- cli ----------

const args = process.argv.slice(2);
const cmd = args[0];
const SLUGLESS = new Set(['bed', 'stats']);   // these act on the Show, not one Episode
const slug = args[1] && !args[1].startsWith('--') ? args[1] : null;
const rest = args.slice(slug ? 2 : 1);
const flag = (name) => { const i = rest.indexOf(`--${name}`); return i === -1 ? null : rest[i + 1]; };

if (!cmd || (!slug && !SLUGLESS.has(cmd))) {
  console.error('usage: node scripts/podcast.mjs <draft|synth|upload|page|cover|bed|stats|all> <episode-slug|show>'
    + ' [--from-writing <slug>] [--from <image>] [--days <n>] [--dry-run]');
  process.exit(1);
}

try {
  if (cmd === 'draft') draft(slug, flag('from-writing'));
  else if (cmd === 'synth') await synth(slug);
  else if (cmd === 'page') page(slug);
  else if (cmd === 'upload') await upload(slug);
  else if (cmd === 'cover') cover(slug, flag('from'));
  else if (cmd === 'bed') await pushBed(flag('from'));
  else if (cmd === 'stats') await stats({ days: flag('days'), dryRun: rest.includes('--dry-run') });
  else if (cmd === 'all') { await synth(slug); await upload(slug); page(slug); }
  else throw new Error(`unknown command: ${cmd}`);
} catch (err) {
  console.error(`[podcast] ${err.message}`);
  process.exit(1);
}
