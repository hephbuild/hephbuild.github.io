/**
 * Search engine loading + querying, kept off the page's critical path.
 *
 * Nothing here reaches the main bundle: every dependency sits behind a dynamic
 * `import()`, so webpack emits them as separate chunks fetched only once search
 * warms up. Warm-up has two independent stages, neither of which blocks the site:
 *
 *   1. the index (~100 kB) plus Orama — enough to answer keyword queries;
 *   2. the embedding model (~34 MB, then cached by the browser) — when it lands,
 *      queries silently upgrade to hybrid ranking.
 *
 * Stage 2 failing (offline, no WebAssembly) is not an error worth showing:
 * search keeps working, just without semantic matching.
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

type Embed = (text: string) => Promise<number[]>;

let indexFile: SearchIndexFile | null = null;
let dbPromise: Promise<AnyOrama | null> | null = null;
let embedderPromise: Promise<boolean> | null = null;
let embed: Embed | null = null;

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

async function buildEmbedder(baseUrl: string): Promise<Embed> {
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

  const extract = await pipeline(
    'feature-extraction',
    indexFile?.model ?? 'Xenova/gte-small',
    { dtype: 'q8', device: 'wasm' },
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
 * Downloads the embedding model in the background and reports whether semantic
 * ranking is now available. Requires the index first — the model id comes from it.
 */
export function warmEmbedder(baseUrl: string): Promise<boolean> {
  if (!embedderPromise) {
    embedderPromise = warmIndex(baseUrl)
      .then((db) => (db ? buildEmbedder(baseUrl) : null))
      .then((fn) => {
        embed = fn;
        return fn !== null;
      })
      .catch(() => false);
  }
  return embedderPromise;
}

export async function runSearch(
  baseUrl: string,
  term: string,
  limit: number,
): Promise<SearchHit[] | null> {
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
  return [...byPage.values()].flat();
}
