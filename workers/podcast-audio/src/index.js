// Episode audio origin for 白鹤札记 — serves the MP3 out of R2 and records one
// data point per audio request in Workers Analytics Engine.
//
// The split of responsibility here is deliberate and load-bearing:
//
//   this Worker      records *facts* about each request (who, which episode, how
//                    many bytes, what status) and nothing else.
//   `podcast.mjs stats`  applies *policy* — the IAB 1-minute threshold and the
//                    24-hour dedup window — when it rolls the facts up.
//
// Policy on the edge would freeze today's reading of the IAB guidelines into
// ninety days of unrecoverable data. Policy in the rollup can be re-run over the
// whole retention window the day the reading changes. See docs/podcast-analytics.md.

// Episode audio only: `<slug>-<hash8>.mp3`, at the path root. The music bed and
// every other object in the bucket stay unreachable — this Worker is an episode
// origin, not a public proxy for R2.
const AUDIO_KEY = /^[a-z0-9][a-z0-9-]*-[0-9a-f]{8}\.mp3$/;

// Only unambiguous non-players are dropped here, because dropping is permanent.
// Anything arguable is recorded and filtered in the rollup, where the decision is
// reversible. Notably absent: okhttp and stagefright — real Android podcast apps.
const OBVIOUS_BOT = /bot\b|spider|crawler|facebookexternalhit|bingpreview|yahoo! slurp|feedfetcher|ahrefs|semrush|uptimerobot|pingdom|headlesschrome/i;

const UA_MAX = 180;    // blob budget; the discriminating part of a UA is at the front
const RANGE_MAX = 64;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const key = decodeURIComponent(url.pathname.slice(1));

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
    }
    if (!AUDIO_KEY.test(key)) return new Response('Not Found', { status: 404 });

    const object = await env.AUDIO.get(key, {
      onlyIf: request.headers,
      range: request.headers,
    });

    if (object === null) return new Response('Not Found', { status: 404 });

    const headers = new Headers();
    object.writeHttpMetadata(headers);          // content-type + cache-control, set at upload
    headers.set('etag', object.httpEtag);
    headers.set('accept-ranges', 'bytes');

    // Preconditions failed: R2 returns the object without a body. A failed
    // If-None-Match is a cache revalidation (304); anything else is a 412.
    if (!('body' in object)) {
      const revalidating = request.headers.has('if-none-match');
      return new Response(null, { status: revalidating ? 304 : 412, headers });
    }

    const size = object.size;
    const span = resolveRange(object.range, size);
    const partial = request.headers.has('range') && (span.offset !== 0 || span.length !== size);

    if (partial) {
      headers.set('content-range', `bytes ${span.offset}-${span.offset + span.length - 1}/${size}`);
    }
    headers.set('content-length', String(span.length));

    const status = partial ? 206 : 200;
    const response = new Response(request.method === 'HEAD' ? null : object.body, { status, headers });

    // HEAD transfers no audio and can never be a download. Everything else is
    // recorded; waitUntil keeps the hash off the response's critical path.
    if (request.method === 'GET') {
      ctx.waitUntil(record(request, env, { key, span, size, object, status }));
    }
    return response;
  },
};

// R2 hands back whichever shape the client asked for. Normalise to an absolute
// (offset, length) inside the object so byte accounting has one code path.
function resolveRange(range, size) {
  if (!range) return { offset: 0, length: size };
  if (range.suffix != null) {
    const length = Math.min(range.suffix, size);
    return { offset: size - length, length };
  }
  const offset = range.offset ?? 0;
  const length = range.length ?? size - offset;
  return { offset, length: Math.max(0, Math.min(length, size - offset)) };
}

async function record(request, env, { key, span, size, object, status }) {
  const ua = request.headers.get('user-agent') || '';
  if (OBVIOUS_BOT.test(ua)) return;

  const episode = key.replace(/-[0-9a-f]{8}\.mp3$/, '');
  const ip = request.headers.get('cf-connecting-ip') || '';

  // Without the salt the hash is a plain digest of IP+UA, and the IPv4 space is small
  // enough to enumerate. Recording still happens — silently counting nothing would be
  // the worse failure, since downloads cannot be backfilled — but this must not pass
  // unnoticed: `wrangler tail` surfaces it.
  if (!env.LISTENER_SALT) {
    console.error('LISTENER_SALT is not set — listener hashes are unsalted and reversible;'
      + ' see workers/podcast-audio/README.md');
  }
  const listener = await listenerHash(env.LISTENER_SALT || '', ip, ua);

  // Duration is stamped on the object at upload. Without it the rollup cannot turn
  // a byte count into seconds of audio, so 0 signals "unknown" rather than guessing.
  const duration = Number(object.customMetadata?.duration || 0);

  env.ANALYTICS.writeDataPoint({
    blobs: [
      episode,
      listener,
      request.cf?.country || '',
      ua.slice(0, UA_MAX),
      (request.headers.get('range') || '').slice(0, RANGE_MAX),
    ],
    doubles: [span.length, size, duration, status],
    indexes: [episode],
  });
}

// A salted, truncated digest of IP + User-Agent. This is the whole identity model:
// enough to tell two requests apart for 24 hours, not enough to reverse into an IP.
// The salt is a Worker secret and must not rotate — rotating it makes every listener
// look new and silently inflates the counts.
async function listenerHash(salt, ip, ua) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}\n${ip}\n${ua}`));
  return [...new Uint8Array(digest).slice(0, 12)]
    .map(b => b.toString(16).padStart(2, '0')).join('');
}
