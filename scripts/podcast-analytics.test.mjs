#!/usr/bin/env node
// Tests for the download-counting path: the audio Worker that records requests, and
// the `stats` rollup that derives downloads from them.
//
// These two exist because download counts cannot be backfilled — the feed is live, and
// a counting bug is only ever discovered after the data it corrupted is gone. Nothing
// else in this repo is worth a test; this is.
//
//   node scripts/podcast-analytics.test.mjs
//
// No framework, by the same instinct as the rest of the repo.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
const check = async (name, fn) => {
  try { await fn(); console.log(`  ok   ${name}`); } catch (e) {
    failures++; console.log(`  FAIL ${name}\n       ${e.message.split('\n')[0]}`);
  }
};

// ---------------------------------------------------------------- the Worker

const worker = (await import(path.join(ROOT, 'workers/podcast-audio/src/index.js'))).default;

const KEY = 'can-education-still-change-destiny-6a8c05a6.mp3';
const SLUG = 'can-education-still-change-destiny';
const SIZE = 3242972, DUR = 405, ETAG = '"abc123"';

// Stands in for the R2 binding. It encodes this repo's reading of R2's get({range})
// semantics, so these tests prove the Worker's own status and byte accounting are
// right — not that R2 behaves this way. `wrangler dev` is the check for that.
function stubBucket({ etag = ETAG, duration = String(DUR) } = {}) {
  return {
    async get(key, opts = {}) {
      if (key !== KEY) return null;
      const bodyless = {
        size: SIZE, httpEtag: etag,
        customMetadata: duration == null ? {} : { duration },
        writeHttpMetadata: (h) => { h.set('content-type', 'audio/mpeg'); },
      };
      if (opts.onlyIf?.get?.('if-none-match') === etag) return bodyless;
      if (opts.onlyIf?.get?.('if-match') === '"stale"') return bodyless;

      const header = opts.range?.get?.('range');
      const m = header && /^bytes=(\d*)-(\d*)$/.exec(header.trim());
      let range;
      if (m) {
        if (m[1] === '') range = { suffix: Number(m[2]) };
        else if (m[2] === '') range = { offset: Number(m[1]) };
        else range = { offset: Number(m[1]), length: Number(m[2]) - Number(m[1]) + 1 };
      }
      return { ...bodyless, range, body: 'stream' };
    },
  };
}

const waits = [];
async function call(pathname, { method = 'GET', headers = {}, bucket } = {}) {
  const recorded = [];
  waits.length = 0;
  const res = await worker.fetch(
    new Request(`https://podcast-audio.example.workers.dev${pathname}`, { method, headers }),
    {
      AUDIO: stubBucket(bucket),
      ANALYTICS: { writeDataPoint: (p) => recorded.push(p) },
      LISTENER_SALT: 'test-salt',
    },
    { waitUntil: (p) => waits.push(p) },
  );
  await Promise.all(waits);
  return { res, recorded };
}

console.log('worker — serving');

await check('a plain GET is 200 with the full length and accept-ranges', async () => {
  const { res } = await call(`/${KEY}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-length'), String(SIZE));
  assert.equal(res.headers.get('accept-ranges'), 'bytes');
  assert.equal(res.headers.get('content-type'), 'audio/mpeg');
  assert.equal(res.headers.get('etag'), ETAG);
  assert.equal(res.headers.get('content-range'), null);
});

await check('an open-ended range covering the whole object is 200, not 206', async () => {
  const { res } = await call(`/${KEY}`, { headers: { range: 'bytes=0-' } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-range'), null);
});

await check('a real partial range is 206 with a correct content-range', async () => {
  const { res } = await call(`/${KEY}`, { headers: { range: 'bytes=1000-1999' } });
  assert.equal(res.status, 206);
  assert.equal(res.headers.get('content-range'), `bytes 1000-1999/${SIZE}`);
  assert.equal(res.headers.get('content-length'), '1000');
});

await check('a suffix range resolves against the end of the object', async () => {
  const { res } = await call(`/${KEY}`, { headers: { range: 'bytes=-500' } });
  assert.equal(res.status, 206);
  assert.equal(res.headers.get('content-range'), `bytes ${SIZE - 500}-${SIZE - 1}/${SIZE}`);
});

await check('an offset-only range runs to the end of the object', async () => {
  const { res } = await call(`/${KEY}`, { headers: { range: 'bytes=3242000-' } });
  assert.equal(res.status, 206);
  assert.equal(res.headers.get('content-range'), `bytes 3242000-${SIZE - 1}/${SIZE}`);
  assert.equal(res.headers.get('content-length'), String(SIZE - 3242000));
});

await check('a matching If-None-Match revalidation is 304', async () => {
  const { res } = await call(`/${KEY}`, { headers: { 'if-none-match': ETAG } });
  assert.equal(res.status, 304);
  assert.equal(res.headers.get('etag'), ETAG);
});

await check('a failed If-Match is 412, not 304', async () => {
  assert.equal((await call(`/${KEY}`, { headers: { 'if-match': '"stale"' } })).res.status, 412);
});

console.log('worker — routing');

await check('the bucket is not reachable beyond episode audio', async () => {
  for (const p of ['/assets/bed-a233f249.mp3', '/bed-a233f249.mp3', '/', '/../secret',
    '/episode.md', `/${SLUG}.mp3`]) {
    assert.equal((await call(p)).res.status, 404, `reachable: ${p}`);
  }
});

await check('a well-formed but absent key is 404', async () => {
  assert.equal((await call('/no-such-episode-deadbeef.mp3')).res.status, 404);
});

await check('non-GET/HEAD methods are refused', async () => {
  const { res } = await call(`/${KEY}`, { method: 'DELETE' });
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('allow'), 'GET, HEAD');
});

console.log('worker — recording');

await check('a GET records one data point with the expected shape', async () => {
  const { recorded } = await call(`/${KEY}`, {
    headers: { 'user-agent': 'AppleCoreMedia/1.0', 'cf-connecting-ip': '203.0.113.7' },
  });
  assert.equal(recorded.length, 1);
  const [p] = recorded;
  assert.equal(p.blobs[0], SLUG);                 // slug, content hash stripped
  assert.match(p.blobs[1], /^[0-9a-f]{24}$/);     // listener hash
  assert.equal(p.blobs[3], 'AppleCoreMedia/1.0');
  assert.deepEqual(p.doubles, [SIZE, SIZE, DUR, 200]);
  assert.deepEqual(p.indexes, [SLUG]);
});

await check('a partial GET records the bytes it actually served', async () => {
  const { recorded } = await call(`/${KEY}`, { headers: { range: 'bytes=0-99' } });
  assert.deepEqual(recorded[0].doubles, [100, SIZE, DUR, 206]);
});

await check('HEAD serves headers but records nothing', async () => {
  const { res, recorded } = await call(`/${KEY}`, { method: 'HEAD' });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-length'), String(SIZE));
  assert.equal(recorded.length, 0);
});

await check('obvious bots are not recorded', async () => {
  for (const ua of ['Googlebot/2.1', 'facebookexternalhit/1.1', 'AhrefsBot/7.0',
    'Mozilla/5.0 HeadlessChrome/120']) {
    assert.equal((await call(`/${KEY}`, { headers: { 'user-agent': ua } })).recorded.length, 0, ua);
  }
});

await check('real players are recorded', async () => {
  for (const ua of ['AppleCoreMedia/1.0.0.21G93 (iPhone)', 'okhttp/4.12.0', 'Spotify/8.9.0']) {
    assert.equal((await call(`/${KEY}`, { headers: { 'user-agent': ua } })).recorded.length, 1, ua);
  }
});

await check('the listener hash is stable per IP+UA and separates them', async () => {
  const h = async (ip, ua) => (await call(`/${KEY}`, {
    headers: { 'cf-connecting-ip': ip, 'user-agent': ua },
  })).recorded[0].blobs[1];
  const a = await h('203.0.113.7', 'AppleCoreMedia/1.0');
  assert.equal(a, await h('203.0.113.7', 'AppleCoreMedia/1.0'));
  assert.notEqual(a, await h('203.0.113.8', 'AppleCoreMedia/1.0'));
  assert.notEqual(a, await h('203.0.113.7', 'Spotify/8.9.0'));
});

await check('the raw IP never leaves the Worker', async () => {
  const { recorded } = await call(`/${KEY}`, {
    headers: { 'cf-connecting-ip': '203.0.113.7', 'user-agent': 'AppleCoreMedia/1.0' },
  });
  assert.equal(JSON.stringify(recorded).includes('203.0.113.7'), false);
});

await check('a missing duration stamp records 0 rather than guessing', async () => {
  const { recorded } = await call(`/${KEY}`, { bucket: { duration: null } });
  assert.equal(recorded[0].doubles[2], 0);
});

await check('an oversized user-agent is truncated to the blob budget', async () => {
  const { recorded } = await call(`/${KEY}`, { headers: { 'user-agent': 'x'.repeat(5000) } });
  assert.equal(recorded[0].blobs[3].length, 180);
});

// ---------------------------------------------------------------- the rollup

// podcast.mjs is a CLI: importing it whole would parse argv. Take the module body up
// to the CLI section, which is declarations only, and import that.
const src = fs.readFileSync(path.join(ROOT, 'scripts/podcast.mjs'), 'utf8');
const shim = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'podcast-test-')), 'lib.mjs');
fs.writeFileSync(shim, src.slice(0, src.indexOf('// ---------- cli ----------'))
  + '\nexport { countDownloads, mergeStats, parseAEDate, utcDay, NON_LISTENER };\n');
const { countDownloads, mergeStats, parseAEDate, utcDay, NON_LISTENER } = await import(shim);

// The pilot Episode: 3,242,972 bytes over 405s => ~8,007 B/s, so a minute is ~480,432 B.
const MINUTE = Math.ceil((SIZE / DUR) * 60);
const T0 = Date.UTC(2026, 7, 24, 10, 0, 0);
const HOUR = 3600 * 1000;

const req = (o = {}) => ({
  t: T0, episode: 'ep', listener: 'L1', ua: 'AppleCoreMedia/1.0',
  bytes: SIZE, size: SIZE, duration: DUR, status: 200, samples: 1, ...o,
});
const count = (rows) => countDownloads(rows.slice().sort((a, b) => a.t - b.t)).length;

console.log('rollup — counting downloads');

await check('a single full-file GET is one download', () => {
  assert.equal(count([req()]), 1);
});

await check('a 2-byte probe alone is not a download', () => {
  assert.equal(count([req({ bytes: 2 })]), 0);
});

await check('probe then full fetch is one download, not two', () => {
  assert.equal(count([req({ bytes: 2 }), req({ t: T0 + 1000 })]), 1);
});

await check('range requests accumulate: 3 x 25s crosses the minute once', () => {
  const third = Math.ceil(MINUTE / 2.4);
  assert.equal(count([
    req({ bytes: third }), req({ t: T0 + 60000, bytes: third }), req({ t: T0 + 120000, bytes: third }),
  ]), 1);
});

await check('partial listens do not carry across the 24h window', () => {
  const half = Math.floor(MINUTE / 2);
  assert.equal(count([req({ bytes: half }), req({ t: T0 + 30 * HOUR, bytes: half })]), 0);
});

await check('two full fetches an hour apart dedup to one', () => {
  assert.equal(count([req(), req({ t: T0 + HOUR })]), 1);
});

await check('two full fetches 25 hours apart are two downloads', () => {
  assert.equal(count([req(), req({ t: T0 + 25 * HOUR })]), 2);
});

await check('the dedup shadow is half-open: [T, T+24h)', () => {
  assert.equal(count([req(), req({ t: T0 + 24 * HOUR - 1000 })]), 1);
  assert.equal(count([req(), req({ t: T0 + 24 * HOUR })]), 2);
});

await check('two listeners are two downloads', () => {
  assert.equal(count([req(), req({ listener: 'L2' })]), 2);
});

await check('two episodes for one listener are two downloads', () => {
  assert.equal(count([req(), req({ episode: 'ep2' })]), 2);
});

await check('bot user agents are dropped', () => {
  assert.equal(count([req({ ua: 'Mozilla/5.0 (compatible; Googlebot/2.1)' })]), 0);
  assert.equal(count([req({ ua: 'curl/8.4.0' })]), 0);
});

await check('real podcast clients survive the filter', () => {
  for (const ua of [
    'AppleCoreMedia/1.0.0.21G93 (iPhone; U; CPU OS 17_6 like Mac OS X)',
    'Spotify/8.9.0 iOS/17.6', 'Overcast/2024.5 (+http://overcast.fm/; iOS podcast app)',
    'okhttp/4.12.0', 'Podcasts/1.0 stagefright/1.2 (Linux;Android 14)',
    'MoonFM/3.2', 'PocketCasts/7.0 (Android)', 'Xiaoyuzhou/2.0',
  ]) assert.equal(NON_LISTENER.test(ua), false, `wrongly filtered: ${ua}`);
});

await check('non-2xx rows are ignored', () => {
  assert.equal(count([req({ status: 404 }), req({ status: 304 })]), 0);
});

await check('a missing duration falls back to the fixed 64kbps rate', () => {
  assert.equal(count([req({ duration: 0, size: 0, bytes: 479999 })]), 0);
  assert.equal(count([req({ duration: 0, size: 0, bytes: 480000 })]), 1);
});

await check('a listener who returns each day is counted each day', () => {
  assert.equal(count([0, 1, 2, 3].map(d => req({ t: T0 + d * 25 * HOUR }))), 4);
});

console.log('rollup — merging into the committed file');

await check('days before the window carry over, days inside are replaced', () => {
  const existing = { episodes: { ep: { total: 9, daily: { '2026-05-01': 4, '2026-08-01': 5 } } } };
  const merged = mergeStats(existing, { ep: { '2026-08-01': 7, '2026-08-02': 3 } }, '2026-08-01');
  assert.deepEqual(merged.ep.daily, { '2026-05-01': 4, '2026-08-01': 7, '2026-08-02': 3 });
  assert.equal(merged.ep.total, 14);
});

await check('an episode with no fresh rows keeps its history', () => {
  const merged = mergeStats({ episodes: { old: { total: 3, daily: { '2026-01-01': 3 } } } }, {}, '2026-08-01');
  assert.deepEqual(merged.old, { total: 3, daily: { '2026-01-01': 3 } });
});

await check('a brand new episode is added', () => {
  assert.equal(mergeStats({}, { fresh: { '2026-08-20': 2 } }, '2026-08-01').fresh.total, 2);
});

await check('re-running over identical data is idempotent', () => {
  const fresh = { ep: { '2026-08-20': 2 } };
  const once = mergeStats({}, fresh, '2026-08-01');
  assert.deepEqual(mergeStats({ episodes: once }, fresh, '2026-08-01'), once);
});

console.log('rollup — timestamps');

await check('ClickHouse DateTime is read as UTC, not local time', () => {
  assert.equal(parseAEDate('2026-08-23 12:34:56'), Date.UTC(2026, 7, 23, 12, 34, 56));
});

await check('ISO timestamps carrying a zone are respected', () => {
  assert.equal(parseAEDate('2026-08-23T12:34:56Z'), Date.UTC(2026, 7, 23, 12, 34, 56));
});

await check('utcDay does not drift with the local timezone', () => {
  assert.equal(utcDay(Date.UTC(2026, 7, 23, 23, 59, 59)), '2026-08-23');
  assert.equal(utcDay(Date.UTC(2026, 7, 24, 0, 0, 1)), '2026-08-24');
});

fs.rmSync(path.dirname(shim), { recursive: true, force: true });
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
