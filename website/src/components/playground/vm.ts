import type { BlockDevice, KernelInstance, Pty } from 'unkernel';
import {
  EXAMPLES, WELCOME, hephconfig, readme,
} from './examples';
import {
  COMPAT_LIB, COMPLETION, HEPH_BIN, IMAGE_PATH,
} from './image';
import { fetchAsset, type Release } from './releases';

export type Stage = 'download' | 'boot' | 'install' | 'ready';

export interface Progress {
  stage: Stage;
  /** 0..1 within the stage, when measurable. */
  fraction?: number;
  detail?: string;
}

export interface Booted {
  vm: KernelInstance;
}

const PLUGIN_DIR = '/opt/heph/plugins';

// The VM reaches the internet through a public Wisp proxy (TCP over a
// WebSocket; browsers can't open sockets). Nothing a start does needs it:
// the image has every package the playground uses (plugins/playground-vm).
// unkernel's own server admits only its own origins, so this is a
// third-party one its docs list: it sees the host names the VM connects to,
// while TLS stays end to end. In order of preference, the first that
// accepts a connection wins (firstReachable): unkernel's own list racing
// picks the fastest handshake, and mercurywork handshakes faster than
// anura but moves bytes ~14x slower (`apk add go`: 3m49 vs 17s). Still
// better than no network when anura is down.
// `?wisp=<url>[,<url>…]` replaces the list, `?wisp=off` cuts the VM off.
const WISP_SERVERS = ['wss://anura.pro/', 'wss://wisp.mercurywork.shop/'];
const WISP_PROBE_MS = 5000;

function wispServers(): string[] {
  const fromQuery = new URLSearchParams(window.location.search).get('wisp');
  if (fromQuery === 'off') return [];
  return fromQuery ? fromQuery.split(',') : WISP_SERVERS;
}

// Commands run as root in /root. The distro's default user is `user`.
const ROOT = { user: 'root', cwd: '/root' } as const;

// Options a plugin refuses to load without. The go plugin needs a toolchain;
// `host` uses the one `apk add go` installs.
const PLUGIN_OPTIONS: Record<string, string> = {
  'heph-go-plugin': '    options:\n      gotool: host\n',
};

/**
 * The first of `urls`, in order, whose WebSocket opens within
 * WISP_PROBE_MS; none: no network. A server that rejects this origin
 * fails the upgrade, so it is skipped too.
 */
async function firstReachable(urls: string[]): Promise<string | undefined> {
  const opens = async (url: string) => {
    const ws = new WebSocket(url);
    const ok = await new Promise<boolean>((resolve) => {
      ws.onopen = () => resolve(true);
      ws.onerror = () => resolve(false);
      setTimeout(() => resolve(false), WISP_PROBE_MS);
    });
    ws.close();
    return ok;
  };
  return urls.reduce<Promise<string | undefined>>(
    async (found, url) => (await found) ?? ((await opens(url)) ? url : undefined),
    Promise.resolve(undefined),
  );
}

/** Run `commands` as root in one shell, stopping at the first that fails. */
async function run(vm: KernelInstance, commands: string | string[]): Promise<string> {
  const command = [commands].flat().join(' && ');
  const { stdout, stderr, exitCode } = await vm.exec('sh', ['-c', command], ROOT);
  if (exitCode !== 0) {
    const output = `${stdout}${stderr}`;
    throw new Error(`\`${command}\` exited ${exitCode ?? 'on a signal'}:\n${output.slice(-2000)}`);
  }
  return stdout;
}

/** Run `steps` one after another. */
function sequence(steps: (() => Promise<unknown>)[]): Promise<void> {
  return steps.reduce<Promise<void>>(
    (prev, step) => prev.then(async () => { await step(); }),
    Promise.resolve(),
  );
}

let mounts = 0;

/** Copy `content` to `path` in the guest, through a throwaway mount. */
async function writeFile(
  vm: KernelInstance,
  path: string,
  content: Uint8Array | string,
  mode?: number,
): Promise<void> {
  mounts += 1;
  const dir = `/mnt/.playground-in-${mounts}`;
  const mount = await vm.mount(dir, { f: content }, { readOnly: true });
  try {
    await run(vm, [
      `mkdir -p '${path.replace(/\/[^/]+$/, '')}'`,
      `cp ${dir}/f '${path}'`,
      ...(mode === undefined ? [] : [`chmod ${mode.toString(8)} '${path}'`]),
    ]);
  } finally {
    await mount.unmount().catch(() => {});
  }
}

/**
 * The root file system as a read-only disk in memory. unkernel could read
 * it lazily with Range requests from a URL, but the image is gzipped (it is
 * stored uncompressed, see plugins/playground-vm), and not every static host
 * honours Range anyway (Cloudflare Pages previews answer 200 with the whole
 * file). A host that sends it with Content-Encoding: gzip has fetch()
 * decompress it already, so only a body that still starts with gzip's
 * magic number is decompressed here.
 */
async function openImage(): Promise<BlockDevice> {
  const { BaseDisk } = await import('unkernel');
  const res = await fetch(IMAGE_PATH);
  if (!res.ok) throw new Error(`${IMAGE_PATH}: HTTP ${res.status}`);
  let blob = await res.blob();
  const magic = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  if (magic[0] === 0x1f && magic[1] === 0x8b) {
    blob = await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).blob();
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return new BaseDisk({
    size: bytes.length,
    identity: `${IMAGE_PATH}:${bytes.length}`,
    read: (off, len) => bytes.subarray(off, off + len),
  });
}

/** Boot the playground's image: everything but heph is already installed. */
async function bootBase(onProgress: (p: Progress) => void): Promise<KernelInstance> {
  const { createKernel, wispBackend } = await import('unkernel');
  onProgress({ stage: 'boot' });
  const [distro, server] = await Promise.all([openImage(), firstReachable(wispServers())]);
  return createKernel({ distro, net: server ? wispBackend(server) : undefined });
}

/**
 * Throw where the VM can't run (no WebAssembly JSPI), before a couple
 * hundred MB of downloads.
 */
export async function checkBrowser(): Promise<void> {
  const { checkSupport } = await import('unkernel');
  const support = await checkSupport();
  if (!support.ok) {
    throw Object.assign(new Error(support.problems.join('\n')), { code: 'unsupported-browser' });
  }
}

/**
 * Download heph + every plugin of `release`, boot and set up a VM meanwhile,
 * and install them. Plugins are mounted read-only; the binary is copied
 * into the VM because it has to be patched and executable.
 */
export async function bootPlayground(
  release: Release,
  onProgress: (p: Progress) => void,
  signal: AbortSignal,
): Promise<Booted> {
  await checkBrowser();

  // --- download, one asset at a time ---------------------------------------
  const names = [release.binary, ...release.plugins.flatMap((p) => [p.manifest, p.lib])];
  const total = names.reduce((n, name) => n + (release.sizes[name] ?? 0), 0);
  let finished = 0;
  const report = (current: number) => {
    const d = finished + current;
    onProgress({
      stage: 'download',
      fraction: total ? Math.min(d / total, 1) : undefined,
      detail: `${(d / 2 ** 20).toFixed(0)} / ${(total / 2 ** 20).toFixed(0)} MiB`,
    });
  };
  report(0);

  // The VM boots meanwhile; its progress shows once the downloads
  // are done, so the two don't fight over the progress display.
  let downloading = true;
  let baseProgress: Progress = { stage: 'boot' };
  const basing = bootBase((p) => {
    baseProgress = p;
    if (!downloading) onProgress(p);
  });
  // Surfaced below, after the downloads; don't let it go unhandled meanwhile.
  basing.catch(() => {});

  const assets = new Map<string, Blob>();
  try {
    // Sequential: the proxy drops concurrent streams.
    await sequence(names.map((name) => async () => {
      const blob = await fetchAsset(release, name, report, signal);
      assets.set(name, blob);
      finished += blob.size;
    }));
  } catch (e) {
    basing.then((vm) => vm.stop(), () => {});
    throw e;
  }
  downloading = false;
  onProgress(baseProgress);

  const vm = await basing;
  if (signal.aborted) {
    vm.stop();
    throw new DOMException('aborted', 'AbortError');
  }

  try {
    onProgress({ stage: 'install', detail: 'heph binary' });
    const binary = new Uint8Array(await assets.get(release.binary)!.arrayBuffer());
    await writeFile(vm, HEPH_BIN, binary, 0o755);
    await run(vm, `patchelf --add-needed ${COMPAT_LIB} ${HEPH_BIN}`);

    // Rewrite each manifest to point at the mounted library instead of its
    // download URL, so heph loads plugins without network access.
    const tree: Record<string, Uint8Array | string> = {};
    await Promise.all(release.plugins.map(async (p) => {
      const text = await assets.get(p.manifest)!.text();
      const m = JSON.parse(text) as { name: string; version?: string };
      tree[p.manifest] = JSON.stringify({
        name: m.name,
        version: m.version,
        artifacts: [{ os: 'linux', arch: 'arm64', path: `./${p.lib}` }],
      }, null, 2);
      tree[p.lib] = new Uint8Array(await assets.get(p.lib)!.arrayBuffer());
    }));
    const entries = release.plugins
      .map((p) => `  - path: ${PLUGIN_DIR}/${p.manifest}\n${PLUGIN_OPTIONS[p.stem] ?? ''}`)
      .join('');
    if (release.plugins.length) {
      onProgress({ stage: 'install', detail: `${release.plugins.length} plugins` });
      // Stays mounted for the life of the VM: heph opens the libraries from here.
      await vm.mount(PLUGIN_DIR, tree, { readOnly: true });
    }

    onProgress({ stage: 'install', detail: 'examples' });
    const config = hephconfig(entries);
    const files = EXAMPLES.flatMap((ex): [string, string][] => {
      const root = `/root/examples/${ex.dir}`;
      return [
        [`${root}/.hephconfig`, config],
        [`${root}/README`, readme(ex)],
        ...Object.entries(ex.files).map(([path, content]): [string, string] => [`${root}/${path}`, content]),
      ];
    });
    const pluginNames = release.plugins.map((p) => p.stem.replace(/^heph-|-plugin$/g, ''));
    files.push(['/etc/heph-welcome', WELCOME(release.tag, EXAMPLES, pluginNames)]);
    // One script of heredocs instead of a round-trip per file: much faster.
    const script = files.map(([path, content]) => (
      `mkdir -p '${path.replace(/\/[^/]+$/, '')}'\ncat > '${path}' <<'HEPH_PLAYGROUND_EOF'\n${content}${content.endsWith('\n') ? '' : '\n'}HEPH_PLAYGROUND_EOF\n`
    )).join('');
    await writeFile(vm, '/tmp/heph-install.sh', script);
    await run(vm, [
      // Pseudo-terminals for `heph run --shell`, and, for the examples, a
      // filesystem with extended attributes, which `codegen = "copy"` needs.
      'mountpoint -q /dev/pts || { mkdir -p /dev/pts && mount -t devpts devpts /dev/pts; }',
      'mkdir -p /root/examples && { mountpoint -q /root/examples || mount -t tmpfs tmpfs /root/examples; }',
      'sh /tmp/heph-install.sh',
      'rm /tmp/heph-install.sh',
      // Releases without `heph tool completions` just go without completion.
      `{ heph tool completions bash > ${COMPLETION} 2>/dev/null || rm -f ${COMPLETION}; }`,
      'heph version',
    ]);
  } catch (e) {
    vm.stop();
    throw e;
  }

  onProgress({ stage: 'ready' });
  return { vm };
}

/** The visitor's shell: a root login bash in the examples directory, on a pty. */
export function openShell(vm: KernelInstance, cols: number, rows: number): Promise<Pty> {
  return vm.spawn('bash', ['-l'], {
    ...ROOT, cwd: '/root/examples', cols, rows,
  });
}
