/**
 * Search engine loading + querying, kept off the page's critical path.
 *
 * Nothing here reaches the main bundle: every dependency sits behind a dynamic
 * `import()`, so webpack emits them as separate chunks fetched only once search
 * warms up. Warm-up has two independent stages, neither of which blocks the site:
 *
 *   1. the index (~270 kB) plus Orama — enough to answer keyword queries;
 *   2. the embedding model (~23 MB, then cached by the browser) — when it lands,
 *      queries silently upgrade to hybrid ranking.
 *
 * Stage 2 is best-effort. No WebAssembly, Data Saver, a 2G connection, a failed
 * download or one that misses the deadline all leave keyword search running —
 * it is a full engine on its own (BM25, stemming, stop-words, typo tolerance),
 * not a stub. The panel footer always states which of the two ranked the
 * results on screen.
 */
import type { AnyOrama, Results } from '@orama/orama';
import type { SearchChunk, SearchIndexFile } from '../../shared/types';
import { dequantize } from '../../shared/quantize';

/** Titles and heading trails are short and highly indicative; body text is not. */
const BOOST = { t: 2.5, b: 2, c: 1 };

/**
 * Hybrid split. Docs queries are mostly keyword-shaped ("remote cache
 * concurrency"), so BM25 stays the senior partner; the vector half is what
 * rescues phrasings the docs never use verbatim ("make my builds reproducible").
 */
const HYBRID_WEIGHTS = { text: 0.6, vector: 0.4 };

/** Below this cosine similarity a chunk is unrelated, not merely a weak match. */
const MIN_SIMILARITY = 0.55;

export interface SearchHit {
  url: string;
  title: string;
  heading: string;
  breadcrumb: string;
  content: string;
}

/**
 * How long we advertise "semantic loading…" before admitting the model is not
 * coming. The download is not cancelled — it may still land and quietly upgrade
 * later queries — we just stop promising it.
 */
const MODEL_DEADLINE_MS = 25_000;

/** Remembers a hard failure so the next page view does not retry 23 MB. */
const FAILURE_KEY = 'heph-search-semantic-unavailable';

/** What the semantic half is doing. `'off'` means nobody has searched yet. */
export type Semantic = 'off' | 'loading' | 'ready' | 'unavailable';

export interface SemanticStatus {
  state: Semantic;
  /** 0-1 while `state` is `'loading'`. */
  progress: number;
}

type Embed = (text: string) => Promise<number[]>;

/** The slice of NetworkInformation we act on; not in the DOM lib. */
interface Connection {
  saveData?: boolean;
  effectiveType?: string;
}

/** transformers.js download progress, one event per file. */
interface ProgressEventLike {
  status?: string;
  file?: string;
  loaded?: number;
  total?: number;
}

let indexFile: SearchIndexFile | null = null;
let dbPromise: Promise<AnyOrama | null> | null = null;
let embed: Embed | null = null;
let started = false;

let status: SemanticStatus = { state: 'off', progress: 0 };
const listeners = new Set<(status: SemanticStatus) => void>();

function publish(patch: Partial<SemanticStatus>): void {
  status = { ...status, ...patch };
  listeners.forEach((listener) => listener(status));
}

/**
 * Watches the semantic half. Module-level rather than per-call because the
 * model outlives any one query: it can arrive after the deadline, after the
 * component re-rendered, or after the user retyped, and every one of those
 * still has to reach the UI.
 */
export function subscribeSemantic(listener: (status: SemanticStatus) => void): () => void {
  listeners.add(listener);
  listener(status);
  return () => { listeners.delete(listener); };
}

/**
 * Whether spending 34 MB on semantic ranking is defensible here. Keyword search
 * is already loaded and already good; the model is an upgrade, not a
 * requirement, so anything that says "this will hurt" means we skip it.
 */
function shouldLoadModel(): boolean {
  // No WebAssembly, no ONNX runtime.
  if (typeof WebAssembly === 'undefined') return false;

  const { connection } = navigator as Navigator & { connection?: Connection };
  // Data Saver is an explicit "do not spend my bandwidth".
  if (connection?.saveData) return false;
  if (connection?.effectiveType && /^(slow-)?2g$/.test(connection.effectiveType)) return false;

  try {
    return window.sessionStorage.getItem(FAILURE_KEY) === null;
  } catch {
    // Storage can throw in locked-down/private contexts; that is not a reason
    // to skip the model.
    return true;
  }
}

function rememberFailure(): void {
  try {
    window.sessionStorage.setItem(FAILURE_KEY, '1');
  } catch {
    // Nothing to do — worst case the next page view retries.
  }
}

async function buildDb(baseUrl: string): Promise<AnyOrama | null> {
  const response = await fetch(`${baseUrl}search/index.json`);
  if (!response.ok) return null;
  const file = (await response.json()) as SearchIndexFile;

  const { create, insertMultiple } = await import('@orama/orama');
  const { stemmer } = await import('@orama/stemmers/english');
  const { stopwords } = await import('@orama/stopwords/english');

  const db = create({
    schema: {
      t: 'string', b: 'string', c: 'string', e: `vector[${file.dim}]`,
    },
    // Stemming lets "caching" match "cache"; dropping stop-words keeps "how do
    // I…" from steering the score.
    components: { tokenizer: { stemming: true, stemmer, stopWords: stopwords } },
  } as Parameters<typeof create>[0]);

  await insertMultiple(db, file.chunks.map((chunk) => ({ ...chunk, e: dequantize(chunk.e) })));
  indexFile = file;
  return db;
}

async function buildEmbedder(baseUrl: string, onProgress: (fraction: number) => void)
  : Promise<Embed> {
  const { env, pipeline } = await import('@huggingface/transformers');

  // Everything is served from this origin — no Hugging Face, no jsDelivr.
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = `${baseUrl}search/models/`;
  if (env.backends.onnx.wasm) {
    env.backends.onnx.wasm.wasmPaths = `${baseUrl}search/ort/`;
    // Threaded WebAssembly needs cross-origin isolation, which static hosting
    // does not provide. One thread is ample for a single short query.
    env.backends.onnx.wasm.numThreads = 1;
  }

  // transformers.js reports bytes per file; the weights dwarf the tokenizer, but
  // summing keeps the bar honest rather than jumping at the end.
  const bytes = new Map<string, { loaded: number; total: number }>();

  const extract = await pipeline(
    'feature-extraction',
    indexFile?.model ?? 'Xenova/all-MiniLM-L6-v2',
    {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: (event: ProgressEventLike) => {
        if (event.status !== 'progress' || !event.file || !event.total) return;
        bytes.set(event.file, { loaded: event.loaded ?? 0, total: event.total });
        const totals = [...bytes.values()];
        const loaded = totals.reduce((sum, f) => sum + f.loaded, 0);
        const total = totals.reduce((sum, f) => sum + f.total, 0);
        if (total > 0) onProgress(loaded / total);
      },
    },
  );

  return async (text: string) => {
    const output = await extract(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data as Float32Array);
  };
}

/** Fetches + builds the index. Safe to call repeatedly; the work happens once. */
export function warmIndex(baseUrl: string): Promise<AnyOrama | null> {
  if (!dbPromise) dbPromise = buildDb(baseUrl).catch(() => null);
  return dbPromise;
}

/**
 * Starts the model download in the background, once per page. Progress and the
 * final verdict reach the UI through `subscribeSemantic`, never a return value.
 *
 * Four ways this ends up `'unavailable'`, all of which leave keyword search
 * running: the environment can't run the model, this connection shouldn't be
 * asked to, the download fails, or it misses the deadline. The last case is not
 * final — the download can't be cancelled through transformers.js, so if it does
 * land later we publish `'ready'` then, and the open query re-ranks itself.
 */
export function warmEmbedder(baseUrl: string): void {
  if (started) return;
  started = true;

  if (!shouldLoadModel()) {
    publish({ state: 'unavailable' });
    return;
  }

  publish({ state: 'loading', progress: 0 });
  window.setTimeout(() => {
    // Stop promising what hasn't arrived; a late arrival still overrides this.
    if (status.state === 'loading') publish({ state: 'unavailable' });
  }, MODEL_DEADLINE_MS);

  warmIndex(baseUrl)
    .then((db) => (db ? buildEmbedder(baseUrl, (progress) => publish({ progress })) : null))
    .then((fn) => {
      embed = fn;
      publish({ state: fn ? 'ready' : 'unavailable' });
    })
    .catch(() => {
      rememberFailure();
      publish({ state: 'unavailable' });
    });
}

export interface SearchResult {
  /** Which ranking answered *these* hits — not the engine's overall state. A
   *  query fired while the model is still downloading is `'keyword'` even
   *  though the next one may be `'hybrid'`. */
  mode: 'hybrid' | 'keyword';
  hits: SearchHit[];
}

export async function runSearch(
  baseUrl: string,
  term: string,
  limit: number,
): Promise<SearchResult | null> {
  const db = await warmIndex(baseUrl);
  if (!db) return null;

  const { search } = await import('@orama/orama');
  const common = {
    term,
    // Over-fetch so the per-anchor de-duplication below still fills the panel.
    limit: limit * 3,
    boost: BOOST,
    // One edit of slack absorbs typos without dragging in unrelated words.
    tolerance: 1,
    properties: ['t', 'b', 'c'],
  };
  const vector = embed ? await embed(term) : null;

  const params = vector
    ? {
      ...common,
      mode: 'hybrid',
      vector: { value: vector, property: 'e' },
      hybridWeights: HYBRID_WEIGHTS,
      similarity: MIN_SIMILARITY,
    }
    : { ...common, mode: 'fulltext' };

  const results = (await search(
    db,
    params as Parameters<typeof search>[1],
  )) as Results<SearchChunk>;

  // One hit per anchor: two chunks of the same section read as a duplicate.
  const seen = new Set<string>();
  const hits: SearchHit[] = [];
  results.hits.forEach(({ document }) => {
    if (seen.has(document.u) || hits.length >= limit) return;
    seen.add(document.u);
    hits.push({
      url: document.u,
      title: document.t,
      heading: document.h,
      breadcrumb: document.b,
      content: document.c,
    });
  });

  // Cluster each page's sections together — pages keep the rank of their best
  // hit, so the panel shows one heading per page instead of the same page name
  // three times down the list.
  const byPage = new Map<string, SearchHit[]>();
  hits.forEach((hit) => {
    const group = byPage.get(hit.title);
    if (group) group.push(hit);
    else byPage.set(hit.title, [hit]);
  });

  return { mode: vector ? 'hybrid' : 'keyword', hits: [...byPage.values()].flat() };
}
