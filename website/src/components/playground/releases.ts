import { PLAYGROUND_PROXY } from '../../constants';

// heph publishes its binaries as GitHub release assets on this repo (the same
// one install.sh pulls from). The playground VM is linux/arm64.
const ARTIFACTS_REPO = 'hephbuild/heph-artifacts-v1';
const BINARY_ASSET = 'heph_linux_arm64';
const PLUGIN_LIB = /^heph-(.+)-plugin_linux_arm64\.so$/;
// Plugins with nothing to do in the playground: devenv needs Nix, gha needs a
// GitHub Actions run.
const SKIPPED_PLUGINS = new Set(['devenv', 'gha']);

export interface Release {
  tag: string;
  /** The release GitHub marks as latest. */
  latest: boolean;
  /** The heph binary for linux/arm64. */
  binary: string;
  /** External plugins shipped with this release, by manifest stem (`heph-go-plugin`). */
  plugins: PluginAsset[];
  /** Byte size of every asset, by name. */
  sizes: Record<string, number>;
}

export interface PluginAsset {
  /** Manifest stem, e.g. `heph-go-plugin`. */
  stem: string;
  manifest: string;
  lib: string;
}

interface GhRelease {
  tag_name: string;
  draft: boolean;
  assets: { name: string; size: number }[];
}

function toRelease(r: GhRelease, latestTag: string): Release {
  const names = new Set(r.assets.map((a) => a.name));
  const plugins = [...names]
    .map((lib) => PLUGIN_LIB.exec(lib)?.[1])
    .filter((id): id is string => !!id && !SKIPPED_PLUGINS.has(id) && names.has(`heph-${id}-plugin.json`))
    .sort()
    .map((id): PluginAsset => ({
      stem: `heph-${id}-plugin`,
      manifest: `heph-${id}-plugin.json`,
      lib: `heph-${id}-plugin_linux_arm64.so`,
    }));
  return {
    tag: r.tag_name,
    latest: r.tag_name === latestTag,
    binary: BINARY_ASSET,
    plugins,
    sizes: Object.fromEntries(r.assets.map((a) => [a.name, a.size])),
  };
}

async function gh<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`https://api.github.com/repos/${ARTIFACTS_REPO}/${path}`, {
    signal,
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) {
    const hint = res.status === 403 ? ' (rate limited, try again later)' : '';
    throw new Error(`GitHub releases API: HTTP ${res.status}${hint}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Recent releases that ship a linux/arm64 binary, newest first, with the
 * release GitHub marks as latest always included. The releases API answers
 * CORS requests directly; only the asset downloads need the proxy.
 */
export async function listReleases(signal?: AbortSignal): Promise<Release[]> {
  const [recent, latest] = await Promise.all([
    gh<GhRelease[]>('releases?per_page=40', signal),
    gh<GhRelease>('releases/latest', signal),
  ]);
  const all = recent.some((r) => r.tag_name === latest.tag_name) ? recent : [latest, ...recent];
  return all
    .filter((r) => !r.draft && r.assets.some((a) => a.name === BINARY_ASSET))
    .map((r) => toRelease(r, latest.tag_name));
}

let allTags: Promise<string[]> | null = null;

/**
 * Every release tag on GitHub, newest first. The API has no release search,
 * but the tag refs come back in a single response, so the picker fetches them
 * once and matches locally. A failed fetch is retried on the next call.
 */
export function listTags(): Promise<string[]> {
  allTags ??= gh<{ ref: string }[]>('git/matching-refs/tags/')
    .then((refs) => refs
      .map((r) => r.ref.replace(/^refs\/tags\//, ''))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true })))
    .catch((e: unknown) => {
      allTags = null;
      throw e;
    });
  return allTags;
}

/** One release by tag, or an error if it has no linux/arm64 binary. */
export async function getRelease(
  tag: string,
  latestTag: string,
  signal?: AbortSignal,
): Promise<Release> {
  const r = await gh<GhRelease>(`releases/tags/${encodeURIComponent(tag)}`, signal);
  if (r.draft || !r.assets.some((a) => a.name === BINARY_ASSET)) {
    throw new Error(`${tag} has no linux/arm64 build`);
  }
  return toRelease(r, latestTag);
}

export function assetUrl(tag: string, name: string): string {
  return `https://github.com/${ARTIFACTS_REPO}/releases/download/${encodeURIComponent(tag)}/${name}`;
}

/**
 * The CORS proxy in use: `?proxy=<prefix>` on the page URL wins over the
 * site default. The proxied URL is the prefix followed by the asset URL.
 */
export function proxyPrefix(): string {
  const fromQuery = new URLSearchParams(window.location.search).get('proxy');
  return fromQuery ?? PLAYGROUND_PROXY;
}

const CACHE_NAME = 'heph-playground-assets-v1';

async function openCache(): Promise<Cache | null> {
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    // No Cache Storage (insecure context, privacy mode): download every time.
    return null;
  }
}

// The proxy drops a stream now and then; a download that stops making progress
// is abandoned and started over.
const STALL_MS = 30_000;
const ATTEMPTS = 4;

async function download(
  url: string,
  expected: number,
  onBytes: (done: number) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  const ac = new AbortController();
  const abort = () => ac.abort();
  signal?.addEventListener('abort', abort);
  let watchdog = setTimeout(abort, STALL_MS);
  try {
    const res = await fetch(url, { signal: ac.signal });
    if (!res.ok || !res.body) {
      const detail = await res.text().then((t) => t.slice(0, 300), () => '');
      throw new Error(`HTTP ${res.status}${detail ? ` — ${detail}` : ''}`);
    }
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let done = 0;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop -- a stream is read in order
      const next = await reader.read();
      if (next.done) break;
      clearTimeout(watchdog);
      watchdog = setTimeout(abort, STALL_MS);
      chunks.push(next.value);
      done += next.value.byteLength;
      onBytes(done);
    }
    if (expected && done !== expected) {
      throw new Error(`truncated: got ${done} of ${expected} bytes`);
    }
    return new Blob(chunks as BlobPart[]);
  } finally {
    clearTimeout(watchdog);
    signal?.removeEventListener('abort', abort);
  }
}

/**
 * Download a release asset through the proxy, reporting bytes as they land,
 * retrying a dropped or stalled transfer. Release tags are immutable, so a
 * copy is kept in Cache Storage under the GitHub URL and later boots skip the
 * download.
 */
export async function fetchAsset(
  release: Release,
  name: string,
  onBytes: (done: number) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  const key = assetUrl(release.tag, name);
  const cache = await openCache();
  const hit = await cache?.match(key);
  if (hit) {
    const blob = await hit.blob();
    onBytes(blob.size);
    return blob;
  }

  const attempt = async (n: number): Promise<Blob> => {
    try {
      return await download(proxyPrefix() + key, release.sizes[name] ?? 0, onBytes, signal);
    } catch (e) {
      if (signal?.aborted || n + 1 >= ATTEMPTS) {
        throw new Error(`download ${name}: ${e instanceof Error ? e.message : String(e)}`);
      }
      onBytes(0);
      return attempt(n + 1);
    }
  };
  const blob = await attempt(0);
  try {
    await cache?.put(key, new Response(blob, { headers: { 'content-length': String(blob.size) } }));
  } catch {
    // Quota exceeded: the boot still works, the next one downloads again.
  }
  return blob;
}
