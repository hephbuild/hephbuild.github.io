import type { QuantizedVector } from './quantize';

/**
 * The shipped index (`static/search/index.json`). Keys are one letter because
 * every one of them repeats once per chunk.
 */
export interface SearchChunk {
  /** Permalink including the heading anchor, e.g. `/docs/concepts/targets#outputs`. */
  u: string;
  /** Page title. */
  t: string;
  /** Nearest heading above the chunk; empty for a page's lead paragraphs. */
  h: string;
  /** Heading trail under the page title, e.g. `Outputs > Collisions`. */
  b: string;
  /** Plain-text body of the chunk — also what the snippet is cut from. */
  c: string;
  /** Embedding of `b` + `c`. */
  e: QuantizedVector;
}

export interface SearchIndexFile {
  /** Index format; bumped when the chunk shape changes. */
  version: number;
  /** Corpus + settings digest — lets the build skip re-embedding unchanged docs. */
  hash: string;
  /** Model id, resolved against `static/search/models/` in the browser. */
  model: string;
  /** Embedding width, for the Orama `vector[n]` schema. */
  dim: number;
  chunks: SearchChunk[];
}

export const SEARCH_INDEX_VERSION = 1;
