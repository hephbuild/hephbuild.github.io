// CORS proxy for the /playground page. GitHub serves release downloads without
// CORS headers, so the browser can't fetch heph binaries directly; this Worker
// fetches them and adds the headers.
//
//   GET https://<host>/heph-release?https://github.com/hephbuild/heph-artifacts-v1/releases/download/<tag>/<asset>
//
// Everything that can be refused is refused before any upstream fetch: wrong
// path, an Origin outside ALLOWED_ORIGINS (a JSON array binding, wildcards
// allowed: see originAllowed), an IP over
// the LIMITER rate limit, a method other than GET/HEAD, anything but a heph
// release asset. Release tags are immutable, so responses are cacheable for a
// year: browsers keep them, and on a custom domain the edge cache serves each
// asset after one GitHub fetch per data center (the Cache API is a no-op on
// workers.dev).

const PATH = '/heph-release';
const ALLOWED_PREFIX = 'https://github.com/hephbuild/heph-artifacts-v1/releases/download/';
const ASSET = /^[^/]+\/[A-Za-z0-9._-]+$/;
const MAX_AGE = 60 * 60 * 24 * 365;

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return '';
  }
}

// A pattern may hold one `*`, standing for exactly one DNS label or port:
// https://*.example.com admits https://preview.example.com but not
// https://a.b.example.com or https://example.com; http://localhost:* admits
// any port on localhost.
function originAllowed(origin, patterns) {
  return patterns.some((pattern) => {
    const [prefix, suffix, ...rest] = pattern.split('*');
    if (suffix === undefined) return origin === pattern;
    if (rest.length) return false;
    if (origin.length <= prefix.length + suffix.length) return false;
    if (!origin.startsWith(prefix) || !origin.endsWith(suffix)) return false;
    return /^[a-z0-9-]+$/.test(origin.slice(prefix.length, origin.length - suffix.length));
  });
}

function corsHeaders(origin) {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, HEAD, OPTIONS',
    'access-control-expose-headers': 'content-length',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

function fail(status, message, cors = {}) {
  return new Response(`${message}\n`, { status, headers: { ...cors, 'content-type': 'text/plain' } });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== PATH) return fail(404, 'not found');

    const origin = request.headers.get('origin') ?? '';
    if (!originAllowed(origin, env.ALLOWED_ORIGINS ?? [])) return fail(403, 'origin not allowed');
    const cors = corsHeaders(origin);

    const ip = request.headers.get('cf-connecting-ip') ?? '';
    const { success } = env.LIMITER ? await env.LIMITER.limit({ key: ip }) : { success: true };
    if (!success) return fail(429, 'too many requests', { ...cors, 'retry-after': '60' });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET' && request.method !== 'HEAD') return fail(405, 'method not allowed', cors);

    // Everything after the first `?` is the target URL, plain or
    // percent-encoded.
    const raw = request.url.slice(request.url.indexOf('?') + 1);
    const target = url.search ? (URL.parse(raw) ?? URL.parse(safeDecode(raw))) : null;
    if (!target) return fail(400, `expected ${PATH}?<github release asset url>`, cors);
    const { href } = target;
    if (!href.startsWith(ALLOWED_PREFIX) || target.search || target.hash
      || !ASSET.test(safeDecode(href.slice(ALLOWED_PREFIX.length)))) {
      return fail(403, 'only hephbuild/heph-artifacts-v1 release assets are proxied', cors);
    }

    // Keyed on the GitHub URL alone, so every origin and spelling of the
    // request shares one cached copy.
    const cache = caches.default;
    const key = new Request(href);
    let response = await cache.match(key);
    if (!response) {
      const upstream = await fetch(href, { redirect: 'follow' });
      if (!upstream.ok) return fail(upstream.status, `upstream: HTTP ${upstream.status}`, cors);
      const headers = new Headers({
        'content-type': 'application/octet-stream',
        'cache-control': `public, max-age=${MAX_AGE}, immutable`,
      });
      const length = upstream.headers.get('content-length');
      if (length) headers.set('content-length', length);
      response = new Response(upstream.body, { headers });
      ctx.waitUntil(cache.put(key, response.clone()));
    }

    const headers = new Headers(response.headers);
    Object.entries(cors).forEach(([k, v]) => headers.set(k, v));
    return new Response(request.method === 'HEAD' ? null : response.body, { status: 200, headers });
  },
};
