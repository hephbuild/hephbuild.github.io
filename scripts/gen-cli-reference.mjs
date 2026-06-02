// Generates the CLI reference by running `heph gen-docs` (heph must already be
// installed and on PATH — see .github/workflows/deploy.yml), then splices the
// markdown into website/docs/reference/cli.md.
//
// `heph gen-docs` prints the code-generated CLI reference markdown to stdout.
// Everything after the `Code generated references` marker in the docs page is
// replaced with it. Re-running is idempotent.
//
// Usage: node scripts/gen-cli-reference.mjs

import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const MARKER = "Code generated references";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOC_PATH = join(__dirname, "..", "website", "docs", "reference", "cli.md");

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} -> exit ${res.status}\n${res.stderr ?? ""}`);
  }
  return res.stdout;
}

async function main() {
  console.log("Running heph gen-docs...");
  const generated = run("heph", ["gen-docs"]).trim();
  if (!generated) throw new Error("`heph gen-docs` produced no output");

  const doc = await readFile(DOC_PATH, "utf8");
  const markerIdx = doc.indexOf(MARKER);
  if (markerIdx === -1) {
    throw new Error(`Marker "${MARKER}" not found in ${DOC_PATH}`);
  }
  // Preserve the preamble through the end of the HTML comment that holds the
  // marker, then drop anything that follows (a previously generated section).
  const commentEnd = doc.indexOf("-->", markerIdx);
  if (commentEnd === -1) {
    throw new Error(`Marker comment in ${DOC_PATH} is not closed with "-->"`);
  }
  const preamble = doc.slice(0, commentEnd + 3).trimEnd();

  await writeFile(DOC_PATH, `${preamble}\n\n${generated}\n`);
  console.log(`Wrote ${DOC_PATH}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
