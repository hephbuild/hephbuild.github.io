/**
 * What the /playground VM needs from this origin, written to `static/playground/`
 * at build time:
 *
 * - `alpine.erofs`: the root file system. unkernel ships its kernel in the npm
 *   package (webpack emits it as an asset) but not the distro images, which
 *   are on its GitHub release (no CORS headers). Downloaded for the installed
 *   unkernel version, checked against the release's SHA-256 index.
 * - `apk/`: a static subset of the Alpine mirror with the packages the VM
 *   installs (see apk.ts), so the VM never reaches the internet.
 *
 * Downloads are cached in `.playground-cache/`.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { LoadContext, Plugin } from '@docusaurus/types';
import {
  ALPINE_ARCH, ALPINE_BRANCH, ALPINE_REPOS, DISTRO_PATH, MIRROR_PATH, PACKAGES,
} from '../../src/components/playground/packages';
import { buildMirror } from './apk';

export default function playgroundVm(context: LoadContext): Plugin {
  const { siteDir } = context;
  const staticDir = path.join(siteDir, 'static');
  const cacheDir = path.join(siteDir, '.playground-cache');

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
      const distro = await fetchDistro('alpine', { cacheDir: path.join(cacheDir, 'distro'), local: false });
      const target = path.join(staticDir, DISTRO_PATH);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(distro, target);

      const { count, bytes } = await buildMirror({
        branch: ALPINE_BRANCH,
        repos: ALPINE_REPOS,
        arch: ALPINE_ARCH,
        packages: PACKAGES,
        outDir: path.join(staticDir, MIRROR_PATH),
        cacheDir: path.join(cacheDir, 'apk'),
      });
      // eslint-disable-next-line no-console -- build-step progress, like every other plugin
      console.log(`[playground-vm] mirrored ${count} Alpine packages (${(bytes / 2 ** 20).toFixed(1)} MiB)`);
    },
  };
}
