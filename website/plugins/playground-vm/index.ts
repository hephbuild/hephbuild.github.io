/**
 * The /playground VM's root file system, built at build time and written to
 * `static/` (gitignored) at IMAGE_PATH: unkernel's Alpine image with
 * everything the playground needs installed (recipe.ts), so the page boots
 * straight into it. unkernel ships its kernel in the npm package (webpack
 * emits it as an asset) but not the distro images, which are on its GitHub
 * release: downloaded for the installed version, checked against the
 * release's SHA-256 index.
 *
 * The image is built in unkernel itself (build-image.ts, a child process:
 * the VM needs JSPI, a flag on Node) and cached in `.playground-cache/`
 * under a digest of everything that goes into it. A cache miss takes about
 * 20 s and needs the network (Alpine's mirror).
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';
import type { LoadContext, Plugin } from '@docusaurus/types';
import { IMAGE_PATH, type ImageInfo } from '../../src/components/playground/image';
import { RECIPE } from './recipe';

async function buildImage(
  builder: string,
  distro: string,
  out: string,
  digest: string,
): Promise<void> {
  const raw = `${out}.raw`;
  const spec = `${out}.json`;
  // The image's UUID comes from the digest: the same inputs, the same image id.
  const uuid = digest.slice(0, 32).replace(/^(.{8})(.{4})(.{4})(.{4})/, '$1-$2-$3-$4-');
  await fs.writeFile(spec, JSON.stringify({
    distro, out: raw, uuid, recipe: RECIPE,
  }));
  try {
    await promisify(execFile)(process.execPath, ['--experimental-wasm-jspi', builder, spec], {
      maxBuffer: 16 * 2 ** 20,
    });
    // Written next to the cache entry and renamed in: an interrupted build
    // never leaves a half image under the digest.
    await fs.writeFile(`${out}.tmp`, gzipSync(await fs.readFile(raw), { level: 9 }));
    await fs.rename(`${out}.tmp`, out);
  } finally {
    await fs.rm(raw, { force: true });
    await fs.rm(spec, { force: true });
  }
}

export default function playgroundVm(context: LoadContext): Plugin<ImageInfo> {
  const { siteDir } = context;
  const cacheDir = path.join(siteDir, '.playground-cache');
  const builder = path.join(siteDir, 'plugins/playground-vm/build-image.ts');
  const require = createRequire(path.join(siteDir, 'package.json'));

  return {
    name: 'playground-vm',

    configureWebpack(_config, isServer) {
      // The VM is browser-only (BrowserOnly + a dynamic import). Left alone,
      // the server bundle would resolve unkernel to its Node build.
      if (isServer) return { resolve: { alias: { unkernel: false } } };
      // unkernel imports its guest-GL renderer from a runtime URL. The
      // playground never turns GL on, and webpack can't follow it anyway.
      return {
        ignoreWarnings: [{ module: /node_modules\/unkernel\//, message: /Critical dependency/ }],
      };
    },

    async loadContent() {
      const { fetchDistro } = await import('unkernel/node');
      const { version } = require('unkernel/package.json') as { version: string };
      const distro = await fetchDistro('alpine', { cacheDir: path.join(cacheDir, 'distro'), local: false });

      const digest = createHash('sha256')
        .update(JSON.stringify({ version, recipe: RECIPE }))
        .update(await fs.readFile(builder))
        .digest('hex');
      const cached = path.join(cacheDir, 'image', `${digest.slice(0, 16)}.erofs.gz`);
      if (!existsSync(cached)) {
        // Older images are of no further use.
        await fs.rm(path.dirname(cached), { recursive: true, force: true });
        await fs.mkdir(path.dirname(cached), { recursive: true });
        const start = Date.now();
        await buildImage(builder, distro, cached, digest);
        // eslint-disable-next-line no-console -- build-step progress, like every other plugin
        console.log(`[playground-vm] built the VM image in ${((Date.now() - start) / 1000).toFixed(0)} s`);
      }
      const target = path.join(siteDir, 'static', IMAGE_PATH);
      // Whatever an older build left here goes: only the image is served.
      await fs.rm(path.dirname(target), { recursive: true, force: true });
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(cached, target);

      const kernel = await fs.stat(require.resolve('unkernel/unkernel.wasm'));
      return { vmBytes: kernel.size + (await fs.stat(cached)).size };
    },

    async contentLoaded({ content, actions }) {
      actions.setGlobalData(content);
    },
  };
}
