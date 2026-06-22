// Compress the LLM-facing markdown the build emits, in place, before publish.
//
// `docusaurus-plugin-llms` writes, into website/build/:
//   - a raw `.md` next to every doc route (generateMarkdownFiles), and
//   - llms-full.txt, the whole docs corpus concatenated for LLM ingestion.
// These exist for LLMs (and humans fetching plain markdown) — not for the
// rendered site — so we run them through the caveman-shrink compressor to drop
// articles/filler/hedging while preserving code, URLs, paths and identifiers
// byte-for-byte. (llms.txt is just a link index, so it's left alone.)
//
// Runs as the last step of `npm run build` (see package.json), so both the
// GitHub Pages deploy and the Cloudflare preview pick it up — they each publish
// website/build after `build`.
//
// Usage: node scripts/caveman-compress.mjs

import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";

const require = createRequire(import.meta.url);
const { compress } = require("caveman-shrink");

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = join(__dirname, "..", "website", "build");

// Non-.md corpus files (relative to BUILD_DIR) to compress as well.
const EXTRA_FILES = ["llms-full.txt"];

async function collectMarkdown(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...await collectMarkdown(full));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

async function main() {
  if (!existsSync(BUILD_DIR)) {
    throw new Error(`Build output not found at ${BUILD_DIR} — run \`build\` first.`);
  }

  const files = [
    ...await collectMarkdown(BUILD_DIR),
    ...EXTRA_FILES.map((f) => join(BUILD_DIR, f)).filter(existsSync),
  ];
  if (files.length === 0) {
    console.log("caveman: no markdown in build output, nothing to compress.");
    return;
  }

  let before = 0;
  let after = 0;
  for (const file of files) {
    const original = await readFile(file, "utf8");
    const { compressed } = compress(original);
    before += original.length;
    after += compressed.length;
    if (compressed !== original) {
      await writeFile(file, compressed);
    }
    console.log(`caveman: ${relative(BUILD_DIR, file)}`);
  }

  const saved = before === 0 ? 0 : Math.round((1 - after / before) * 100);
  console.log(`caveman: compressed ${files.length} file(s), ${before} → ${after} bytes (-${saved}%).`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
