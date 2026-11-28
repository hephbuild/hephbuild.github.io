/**
 * A static subset of an Alpine mirror: the signed indexes of each repo plus
 * every package an `apk add` of the playground's packages can fetch. apk in
 * the VM verifies the index signatures and the package checksums, as it
 * would against the real mirror.
 */
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

const UPSTREAM = 'https://dl-cdn.alpinelinux.org/alpine';

interface Pkg {
  name: string;
  version: string;
  repo: string;
  deps: string[];
  provides: string[];
  installIf: string[];
}

export interface MirrorOptions {
  branch: string;
  repos: string[];
  arch: string;
  packages: string[];
  /** Mirror root: files land at `<outDir>/alpine/<branch>/<repo>/<arch>/`. */
  outDir: string;
  /** Downloaded packages are kept here across builds. */
  cacheDir: string;
}

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`playground-vm: cannot download ${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** The APKINDEX text out of APKINDEX.tar.gz (gzip members: signature, then index). */
function indexText(tarGz: Buffer): string {
  const tar = gunzipSync(tarGz);
  for (let off = 0; off + 512 <= tar.length;) {
    const name = tar.toString('latin1', off, off + 100).replace(/\0.*$/s, '');
    if (!name) break;
    const size = parseInt(tar.toString('latin1', off + 124, off + 136).replace(/\0.*$/s, '').trim() || '0', 8);
    if (name === 'APKINDEX') return tar.toString('utf8', off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error('playground-vm: no APKINDEX in the index archive');
}

/** A dependency or provide token without its version constraint. */
const bare = (token: string) => token.split(/[<>=~]/)[0]!;

function parseIndex(text: string, repo: string): Pkg[] {
  return text.split('\n\n').flatMap((record) => {
    const fields = new Map<string, string>();
    record.split('\n').forEach((line) => {
      if (line[1] === ':') fields.set(line[0]!, line.slice(2));
    });
    const name = fields.get('P');
    const version = fields.get('V');
    if (!name || !version) return [];
    const list = (key: string) => (fields.get(key) ?? '').split(' ').filter(Boolean);
    return [{
      name, version, repo, deps: list('D'), provides: list('p').map(bare), installIf: list('i'),
    }];
  });
}

/**
 * Every package `packages` can pull in: their dependencies, transitively,
 * and the install_if packages that set triggers. Like apk, a later repo's
 * package does not shadow an earlier one's.
 */
function closure(all: Pkg[], packages: string[]): Pkg[] {
  const byName = new Map<string, Pkg>();
  const provider = new Map<string, Pkg>();
  all.forEach((p) => {
    if (!byName.has(p.name)) byName.set(p.name, p);
    p.provides.forEach((name) => { if (!provider.has(name)) provider.set(name, p); });
  });
  const resolve = (token: string) => byName.get(bare(token)) ?? provider.get(bare(token));

  const chosen = new Map<string, Pkg>();
  const queue = [...packages];
  const unresolved = new Set<string>();
  for (;;) {
    while (queue.length) {
      const token = queue.pop()!;
      if (!token.startsWith('!')) {
        const pkg = resolve(token);
        if (!pkg) unresolved.add(token);
        else if (!chosen.has(pkg.name)) {
          chosen.set(pkg.name, pkg);
          queue.push(...pkg.deps);
        }
      }
    }
    // Names the chosen set provides, for install_if.
    const have = new Set([...chosen.values()].flatMap((p) => [p.name, ...p.provides]));
    const triggered = all.filter((p) => !chosen.has(p.name) && p.installIf.length
      && p.installIf.every((t) => have.has(bare(t))));
    if (!triggered.length) break;
    queue.push(...triggered.map((p) => p.name));
  }
  if (unresolved.size) {
    throw new Error(`playground-vm: no package provides ${[...unresolved].join(', ')}`);
  }
  return [...chosen.values()];
}

/** Write the mirror. Returns the number of packages and their total bytes. */
export async function buildMirror(o: MirrorOptions): Promise<{ count: number; bytes: number }> {
  const dir = (repo: string) => path.join(o.outDir, 'alpine', o.branch, repo, o.arch);
  const url = (repo: string, file: string) => `${UPSTREAM}/${o.branch}/${repo}/${o.arch}/${file}`;

  // A fresh index every build, so the packages always exist upstream; the
  // site then serves that index and its packages together, consistently.
  const indexes = await Promise.all(o.repos.map(async (repo) => {
    const archive = await download(url(repo, 'APKINDEX.tar.gz'));
    return { repo, archive, pkgs: parseIndex(indexText(archive), repo) };
  }));
  const wanted = closure(indexes.flatMap((i) => i.pkgs), o.packages);

  // Wipe first: packages from an older index must not linger.
  await fs.rm(path.join(o.outDir, 'alpine'), { recursive: true, force: true });
  await Promise.all(indexes.map(async ({ repo, archive }) => {
    await fs.mkdir(dir(repo), { recursive: true });
    await fs.writeFile(path.join(dir(repo), 'APKINDEX.tar.gz'), archive);
  }));

  const sizes = await Promise.all(wanted.map(async (p) => {
    const file = `${p.name}-${p.version}.apk`;
    const cached = path.join(o.cacheDir, o.branch, p.repo, file);
    if (!existsSync(cached)) {
      const bytes = await download(url(p.repo, file));
      await fs.mkdir(path.dirname(cached), { recursive: true });
      await fs.writeFile(cached, bytes);
    }
    await fs.copyFile(cached, path.join(dir(p.repo), file));
    return (await fs.stat(cached)).size;
  }));
  return { count: wanted.length, bytes: sizes.reduce((a, b) => a + b, 0) };
}
