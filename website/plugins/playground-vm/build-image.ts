/**
 * Builds the playground's root file system inside unkernel itself, so
 * Alpine's own apk installs it, scripts and triggers included:
 *
 *   node --experimental-wasm-jspi build-image.ts SPEC.json
 *
 * SPEC: { distro, out, uuid, recipe } (see index.ts). The new root is an
 * overlay on the bare distro image, not the running root: that one also
 * carries unkernel's own layer, which comes with the kernel and must stay
 * out of the image. Its packages come from the internet (the build host's
 * network); the image keeps the real Alpine repositories for the visitor.
 *
 * Uncompressed: the kernel reads zstd and lz4 erofs only, Alpine's
 * mkfs.erofs has no zstd, and lz4 fails on unkernel's kernel. The plugin
 * gzips it for the wire instead.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createKernel, directBackend, nodeFs } from 'unkernel/node';

interface Spec {
  distro: string;
  out: string;
  uuid: string;
  recipe: {
    packages: string[];
    files: { path: string; content: string; mode?: number }[];
    commands: string[];
  };
}

const spec = JSON.parse(await fs.readFile(process.argv[2]!, 'utf8')) as Spec;
const { recipe } = spec;
const ROOT = '/build/root';

const vm = await createKernel({ distro: spec.distro, net: directBackend() });

async function sh(...commands: string[]): Promise<void> {
  const command = commands.join(' && ');
  const { stdout, stderr, exitCode } = await vm.exec('sh', ['-c', command], { user: 'root', cwd: '/' });
  if (exitCode !== 0) {
    throw new Error(`\`${command}\` exited ${exitCode ?? 'on a signal'}:\n${`${stdout}${stderr}`.slice(-3000)}`);
  }
}

const quote = (s: string) => `'${s.replaceAll("'", "'\\''")}'`;

try {
  const inputs = Object.fromEntries(recipe.files.map((f, i) => [`f${i}`, f.content]));
  await vm.mount('/mnt/in', inputs, { readOnly: true });
  await fs.mkdir(path.dirname(spec.out), { recursive: true });
  await vm.mount('/mnt/out', nodeFs(path.dirname(spec.out)));

  await sh(
    // The image's release branch, both repos.
    'branch=v$(cut -d. -f1,2 /etc/alpine-release)',
    'printf "https://dl-cdn.alpinelinux.org/alpine/%s/%s\\n" $branch main $branch community > /etc/apk/repositories',
    'apk add --no-cache --quiet erofs-utils',
    // tmpfs for the upper layer: overlay wants one that isn't itself an overlay.
    `mkdir -p /build/layer ${ROOT}`,
    'mount -t tmpfs tmpfs /build/layer',
    'mkdir /build/layer/upper /build/layer/work',
    `mount -t overlay overlay -o lowerdir=/run/kw-lower/kw/distro,upperdir=/build/layer/upper,workdir=/build/layer/work ${ROOT}`,
    `cp /etc/apk/repositories ${ROOT}/etc/apk/repositories`,
    `apk add --no-cache --quiet --root ${ROOT} ${recipe.packages.join(' ')}`,
    ...recipe.files.flatMap((f, i) => [
      `mkdir -p ${quote(path.posix.dirname(ROOT + f.path))}`,
      `cp /mnt/in/f${i} ${quote(ROOT + f.path)}`,
      ...(f.mode === undefined ? [] : [`chmod ${f.mode.toString(8)} ${quote(ROOT + f.path)}`]),
    ]),
    ...recipe.commands.map((c) => `chroot ${ROOT} sh -c ${quote(c)}`),
    `mkfs.erofs --quiet -L kwroot -U ${spec.uuid} /mnt/out/${quote(path.basename(spec.out))} ${ROOT}`,
  );
} finally {
  vm.stop();
}
process.exit(0);
