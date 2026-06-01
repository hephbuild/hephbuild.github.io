// Pulls the code-generated CLI reference from the latest heph release and
// splices it into website/docs/reference/cli.md.
//
// The heph build pipeline publishes a `cli.md` asset on each release of
// hephbuild/heph-artifacts-v1. We grab it from the latest stable release
// (pre-releases are ignored), download it, and replace everything after the
// `Code generated references` marker in the docs page. Re-running is idempotent.
//
// Usage: node scripts/gen-cli-reference.mjs
// Honors GITHUB_TOKEN (raises the GitHub API rate limit; required in CI).

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = "hephbuild/heph-artifacts-v1";
const ASSET = "cli.md";
const MARKER = "Code generated references";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOC_PATH = join(__dirname, "..", "website", "docs", "reference", "cli.md");

function headers() {
  const h = { Accept: "application/vnd.github+json", "User-Agent": "heph-docs" };
  const token = process.env.GITHUB_TOKEN;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function gh(path) {
  const res = await fetch(`https://api.github.com${path}`, { headers: headers() });
  if (!res.ok) {
    throw new Error(`GitHub API ${path} -> ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// Latest stable release. The /releases/latest endpoint excludes pre-releases.
async function findRelease() {
  const release = await gh(`/repos/${REPO}/releases/latest`);
  const asset = release.assets?.find((a) => a.name === ASSET);
  if (!asset) {
    throw new Error(`Latest release ${release.tag_name} has no "${ASSET}" asset`);
  }
  return { release, asset };
}

async function downloadAsset(asset) {
  const res = await fetch(asset.browser_download_url, { headers: { "User-Agent": "heph-docs" } });
  if (!res.ok) {
    throw new Error(`Download ${asset.browser_download_url} -> ${res.status} ${res.statusText}`);
  }
  return res.text();
}

async function main() {
  const { release, asset } = await findRelease();
  console.log(`heph ${release.tag_name}: downloading ${asset.name}`);
  const generated = (await downloadAsset(asset)).trim();

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
  console.log(`Wrote ${DOC_PATH} (${release.tag_name})`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
