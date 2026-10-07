import type { Vm } from 'arm64js';
import { EXAMPLES, WELCOME, hephconfig } from './examples';
import { fetchAsset, type Release } from './releases';

export type Stage = 'download' | 'boot' | 'packages' | 'install' | 'ready';

export interface Progress {
  stage: Stage;
  /** 0..1 within the stage, when measurable. */
  fraction?: number;
  detail?: string;
}

export interface Booted {
  vm: Vm;
  vcpus: number;
}

// Ask for two vCPUs. An image boots only with a vCPU count it was published
// for, and `alpine` currently ships a single-vCPU build — fall back to that.
const VCPUS = 2;
const PLUGIN_DIR = '/opt/heph/plugins';

// heph and its plugins are glibc builds; Alpine is musl. gcompat bridges the
// two, libgcc carries the unwinder, bash backs the `bash` driver, and tcc
// builds COMPAT_SHIM.
const PACKAGES = 'gcompat libgcc libstdc++ bash coreutils tcc tcc-libs';

// The two glibc symbols gcompat lacks, forwarded to their musl equivalents.
// Preloaded into heph, so the plugins it opens resolve them too. (On arm64 a
// variadic argument travels like a fixed one, so fcntl64 needs no stdarg.)
const COMPAT_SHIM = `int res_init(void);
int fcntl(int, int, ...);
int __res_init(void) { return res_init(); }
int fcntl64(int fd, int cmd, long arg) { return fcntl(fd, cmd, arg); }
`;
const HEPH_BIN = '/opt/heph/bin/heph';
const COMPAT_LIB = '/opt/heph/lib/libhephcompat.so';

// Options a plugin refuses to load without. The go plugin needs a toolchain;
// `host` uses the one `apk add go` installs.
const PLUGIN_OPTIONS: Record<string, string> = {
  'heph-go-plugin': '    options:\n      gotool: host\n',
};

async function run(vm: Vm, command: string, timeoutMs = 300_000): Promise<string> {
  const { output, exitCode } = await vm.exec(command, { timeoutMs });
  if (exitCode !== 0) {
    throw new Error(`\`${command}\` exited ${exitCode}:\n${output.slice(-2000)}`);
  }
  return output;
}

/** Run `steps` one after another. */
function sequence(steps: (() => Promise<unknown>)[]): Promise<void> {
  return steps.reduce<Promise<void>>(
    (prev, step) => prev.then(async () => { await step(); }),
    Promise.resolve(),
  );
}

async function bootAlpine(): Promise<Booted> {
  const { Arm64JS } = await import('arm64js');
  try {
    return { vm: await Arm64JS.boot('alpine', { vcpus: VCPUS }), vcpus: VCPUS };
  } catch (e) {
    if (!/vcpu/i.test(String((e as Error)?.message))) throw e;
    return { vm: await Arm64JS.boot('alpine', { vcpus: 1 }), vcpus: 1 };
  }
}

/**
 * Download heph + every plugin of `release`, boot Alpine, and install them.
 * Plugins are mounted read-only (no VM memory); the binary is written into the
 * VM because it has to be executable.
 */
export async function bootPlayground(
  release: Release,
  onProgress: (p: Progress) => void,
  signal: AbortSignal,
): Promise<Booted> {
  // --- download, one asset at a time, while the VM boots ------------------
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

  const booting = bootAlpine();
  // Surfaced below, after the downloads; don't let it go unhandled meanwhile.
  booting.catch(() => {});
  const assets = new Map<string, Blob>();
  try {
    // Sequential: the proxy drops concurrent streams.
    await sequence(names.map((name) => async () => {
      const blob = await fetchAsset(release, name, report, signal);
      assets.set(name, blob);
      finished += blob.size;
    }));
  } catch (e) {
    booting.then(({ vm }) => vm.dispose(), () => {});
    throw e;
  }

  onProgress({ stage: 'boot' });
  const booted = await booting;
  const { vm } = booted;
  if (signal.aborted) {
    vm.dispose();
    throw new DOMException('aborted', 'AbortError');
  }

  try {
    onProgress({ stage: 'packages', detail: PACKAGES });
    await run(vm, `apk add --no-cache ${PACKAGES}`);

    onProgress({ stage: 'install', detail: 'heph binary' });
    await vm.writeFile(HEPH_BIN, assets.get(release.binary)!, { mode: 0o755 });
    await vm.writeFile('/opt/heph/lib/compat.c', COMPAT_SHIM);
    await run(vm, `tcc -shared -nostdlib -o ${COMPAT_LIB} /opt/heph/lib/compat.c`);
    await vm.writeFile('/usr/local/bin/heph', [
      '#!/bin/sh',
      // The VM is offline: skip the self-update check and telemetry.
      'export HEPH_NO_SELF_UPDATE=1 HEPH_DISABLE_TELEMETRY=1',
      `LD_PRELOAD=${COMPAT_LIB} exec ${HEPH_BIN} "$@"`,
      '',
    ].join('\n'), { mode: 0o755 });

    // Rewrite each manifest to point at the mounted library instead of its
    // download URL, so heph loads plugins without network access.
    const manifests = await Promise.all(release.plugins.map(async (p) => {
      const text = await assets.get(p.manifest)!.text();
      const m = JSON.parse(text) as { name: string; version?: string };
      return [p.manifest, new Blob([JSON.stringify({
        name: m.name,
        version: m.version,
        artifacts: [{ os: 'linux', arch: 'arm64', path: `./${p.lib}` }],
      }, null, 2)])] as const;
    }));
    const mounted: Record<string, Blob> = Object.fromEntries([
      ...manifests,
      ...release.plugins.map((p) => [p.lib, assets.get(p.lib)!] as const),
    ]);
    const entries = release.plugins
      .map((p) => `  - path: ${PLUGIN_DIR}/${p.manifest}\n${PLUGIN_OPTIONS[p.stem] ?? ''}`)
      .join('');
    if (release.plugins.length) {
      onProgress({ stage: 'install', detail: `${release.plugins.length} plugins` });
      await vm.mount(mounted, PLUGIN_DIR);
    }

    onProgress({ stage: 'install', detail: 'examples' });
    const config = hephconfig(entries);
    const files = EXAMPLES.flatMap((ex): [string, string][] => {
      const root = `/root/examples/${ex.dir}`;
      return [
        [`${root}/.hephconfig`, config],
        [`${root}/README`, `# ${ex.title}\n\n${ex.readme}\n`],
        ...Object.entries(ex.files).map(([path, content]): [string, string] => [`${root}/${path}`, content]),
      ];
    });
    const pluginNames = release.plugins.map((p) => p.stem.replace(/^heph-|-plugin$/g, ''));
    files.push(
      ['/etc/heph-welcome', WELCOME(release.tag, EXAMPLES, pluginNames)],
      ['/etc/profile.d/heph.sh', [
        'export PS1="\\w \\$ "',
        'cat /etc/heph-welcome',
        '',
      ].join('\n')],
    );
    await sequence(files.map(([path, content]) => () => vm.writeFile(path, content)));
    await run(vm, 'heph version');
  } catch (e) {
    vm.dispose();
    throw e;
  }

  onProgress({ stage: 'ready' });
  return booted;
}

/** Hand the console to the visitor: a login bash in the examples directory. */
export function enterShell(vm: Vm): Promise<void> {
  return vm.write('clear; cd /root/examples && exec bash -l\r');
}
