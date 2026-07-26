/**
 * Local hybrid search — the build step.
 *
 * Docs are chunked at their headings, embedded once at build time, quantised to
 * int8 and written to `static/search/index.json`. The embedding model and the
 * ONNX WebAssembly runtime are copied next to it, so the browser fetches
 * everything from this origin: no search backend, no CDN, no third party. The
 * matching client half lives in `theme/SearchBar`.
 *
 * Embeddings are cached against a digest of the corpus + settings, so a rebuild
 * that did not touch the docs skips the model entirely.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { LoadContext, Plugin } from '@docusaurus/types';
import { chunkMarkdown } from './markdown';
import { quantize } from './shared/quantize';
import { SEARCH_INDEX_VERSION, type SearchChunk, type SearchIndexFile } from './shared/types';

export interface OramaSearchOptions {
  /**
   * Hugging Face id of a sentence-embedding model with ONNX weights. Anything
   * with an `onnx/model_quantized.onnx` works; `dim` must match its width.
   */
  model?: string;
  /** Embedding width of `model`. */
  dim?: number;
  /** How many chunks to embed per forward pass. */
  batchSize?: number;
}

const DEFAULTS = {
  model: 'Xenova/gte-small',
  dim: 384,
  batchSize: 16,
} satisfies Required<OramaSearchOptions>;

/** Everything transformers.js needs to run a text model offline. */
const MODEL_FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/model_quantized.onnx',
];

const HF_ENDPOINT = 'https://huggingface.co';

/** Where the generated assets land, relative to `static/`. */
const OUT_DIR = 'search';

interface DocEntry {
  title: string;
  permalink: string;
  source: string;
}

/** Pulls the current docs version out of the docs plugin's loaded content. */
function collectDocs(allContent: Record<string, Record<string, unknown>>): DocEntry[] {
  const docsPlugin = allContent['docusaurus-plugin-content-docs'] ?? {};

  return Object.values(docsPlugin).flatMap((instance) => {
    const versions = (instance as { loadedVersions?: unknown[] } | undefined)?.loadedVersions ?? [];
    const current = versions.filter((v) => (v as { isLast?: boolean }).isLast !== false);
    return current.flatMap((version) => (version as { docs?: DocEntry[] }).docs ?? []);
  });
}

/** Downloads a model file once; later builds reuse the cache directory. */
async function fetchModelFile(model: string, file: string, cacheDir: string): Promise<string> {
  const target = path.join(cacheDir, model, file);
  if (existsSync(target)) return target;

  const url = `${HF_ENDPOINT}/${model}/resolve/main/${file}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`orama-search: cannot download ${url} — HTTP ${response.status}`);
  }

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, Buffer.from(await response.arrayBuffer()));
  return target;
}

/** Walks up from `from` until it finds `node_modules/<pkg>` (npm workspaces
 *  hoist to the repo root, but a nested install must keep working). */
function resolvePackageDir(from: string, pkg: string): string {
  let dir = from;
  for (;;) {
    const candidate = path.join(dir, 'node_modules', pkg);
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`orama-search: cannot locate ${pkg} from ${from}`);
    dir = parent;
  }
}

async function copyModelAssets(model: string, cacheDir: string, outDir: string): Promise<void> {
  await Promise.all(MODEL_FILES.map(async (file) => {
    const source = await fetchModelFile(model, file, cacheDir);
    const target = path.join(outDir, 'models', model, file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(source, target);
  }));
}

/** Copies the ONNX WebAssembly runtime so the browser never touches a CDN. */
async function copyRuntimeAssets(siteDir: string, outDir: string): Promise<void> {
  const dist = path.join(resolvePackageDir(siteDir, 'onnxruntime-web'), 'dist');
  const target = path.join(outDir, 'ort');
  await fs.mkdir(target, { recursive: true });

  const files = (await fs.readdir(dist)).filter((f) => /^ort-wasm.*\.(wasm|mjs)$/.test(f));
  await Promise.all(files.map((f) => fs.copyFile(path.join(dist, f), path.join(target, f))));
}

async function embedAll(
  texts: string[],
  model: string,
  cacheDir: string,
  batchSize: number,
): Promise<number[][]> {
  const { env, pipeline } = await import('@huggingface/transformers');

  // Same weights the browser loads, so a query embeds into the same space as
  // the chunks it is compared against.
  env.allowRemoteModels = false;
  env.localModelPath = cacheDir;

  const extract = await pipeline('feature-extraction', model, { dtype: 'q8' });

  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    // Sequential on purpose — batches share one session; racing them only
    // multiplies memory.
    // eslint-disable-next-line no-await-in-loop
    const output = await extract(batch, { pooling: 'mean', normalize: true });
    vectors.push(...(output.tolist() as number[][]));
  }

  await extract.dispose();
  return vectors;
}

export default function oramaSearchPlugin(
  context: LoadContext,
  options: OramaSearchOptions = {},
): Plugin<void> {
  const { model, dim, batchSize } = { ...DEFAULTS, ...options };
  const { siteDir } = context;
  const outDir = path.join(siteDir, 'static', OUT_DIR);
  const cacheDir = path.join(siteDir, '.search-cache');
  const indexPath = path.join(outDir, 'index.json');

  return {
    name: 'orama-search',

    getThemePath() {
      return path.join(siteDir, 'plugins', 'orama-search', 'theme');
    },

    configureWebpack(_config, isServer) {
      // The embedding runtime is browser-only. Left alone, the server bundle
      // would resolve transformers.js to its Node build and drag in native ONNX
      // binaries it can never use during pre-rendering.
      if (!isServer) return {};
      return { resolve: { alias: { '@huggingface/transformers': false } } };
    },

    async allContentLoaded({ allContent }) {
      const docs = collectDocs(allContent as Record<string, Record<string, unknown>>);
      if (docs.length === 0) return;

      const chunks: Omit<SearchChunk, 'e'>[] = [];
      const texts: string[] = [];

      await Promise.all(docs.map(async (doc) => {
        const file = doc.source.replace(/^@site\//, `${siteDir}/`);
        const markdown = await fs.readFile(file, 'utf8');

        chunkMarkdown(markdown).forEach((chunk) => {
          chunks.push({
            u: chunk.anchor ? `${doc.permalink}#${chunk.anchor}` : doc.permalink,
            t: doc.title,
            h: chunk.heading,
            b: chunk.breadcrumb,
            c: chunk.content,
          });
        });
      }));

      // The heading trail goes into the embedding: a chunk read on its own is
      // often ambiguous, the same chunk under "Remote cache > Concurrency" is not.
      chunks.forEach((chunk) => {
        const trail = [chunk.t, chunk.b].filter(Boolean).join(' > ');
        texts.push(`${trail}\n${chunk.c}`);
      });

      const hash = createHash('sha256')
        .update(JSON.stringify({
          model, dim, version: SEARCH_INDEX_VERSION, texts,
        }))
        .digest('hex');

      if (existsSync(indexPath)) {
        const existing = JSON.parse(await fs.readFile(indexPath, 'utf8')) as SearchIndexFile;
        if (existing.hash === hash) return;
      }

      await fs.mkdir(outDir, { recursive: true });
      await copyModelAssets(model, cacheDir, outDir);
      await copyRuntimeAssets(siteDir, outDir);

      const vectors = await embedAll(texts, model, cacheDir, batchSize);
      if (vectors.length !== chunks.length) {
        throw new Error(
          `orama-search: embedded ${vectors.length} vectors for ${chunks.length} chunks`,
        );
      }

      const index: SearchIndexFile = {
        version: SEARCH_INDEX_VERSION,
        hash,
        model,
        dim,
        chunks: chunks.map((chunk, i) => ({ ...chunk, e: quantize(vectors[i] ?? []) })),
      };

      await fs.writeFile(indexPath, JSON.stringify(index));
      // eslint-disable-next-line no-console -- build-step progress, like every other plugin
      console.log(`[orama-search] indexed ${chunks.length} chunks from ${docs.length} docs`);
    },
  };
}
