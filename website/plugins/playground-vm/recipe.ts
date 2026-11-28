/**
 * What goes into the playground's root file system on top of unkernel's
 * Alpine image. Everything here is the same for every heph release; what
 * depends on the release (heph, its plugins, the examples' .hephconfig) is
 * installed by the page.
 */
import { COMPAT_LIB, COMPLETION, HEPH_BIN } from '../../src/components/playground/image';

export interface Recipe {
  /** Alpine packages, from the image's release branch (main and community). */
  packages: string[];
  files: { path: string; content: string; mode?: number }[];
  /** Shell commands run in the new root once the files are in. */
  commands: string[];
}

// heph and its plugins are glibc builds; Alpine is musl. gcompat bridges the
// two, libgcc carries the unwinder, bash backs the `bash` driver. tcc builds
// the compat shim and the C examples, with musl-dev for the libc headers.
// patchelf links the shim into the heph binary.
const PACKAGES = [
  'gcompat', 'libgcc', 'libstdc++', 'bash', 'coreutils',
  'tcc', 'tcc-libs', 'tcc-libs-static', 'musl-dev', 'patchelf',
];

// The two glibc symbols gcompat lacks, forwarded to their musl equivalents.
// Linked into the heph binary rather than preloaded: heph re-runs itself for
// builtin tools (`tr` in a `bash` target) with a clean environment, which
// drops LD_PRELOAD. The plugins it opens resolve them too. (On arm64 a
// variadic argument travels like a fixed one, so fcntl64 needs no stdarg.)
const COMPAT_SHIM = `int res_init(void);
int fcntl(int, int, ...);
int __res_init(void) { return res_init(); }
int fcntl64(int fd, int cmd, long arg) { return fcntl(fd, cmd, arg); }
`;

const WRAPPER = [
  '#!/bin/sh',
  // The release is picked on the page: skip the self-update check, and telemetry.
  'export HEPH_NO_SELF_UPDATE=1 HEPH_DISABLE_TELEMETRY=1',
  `exec ${HEPH_BIN} "$@"`,
  '',
].join('\n');

const PROFILE = [
  'export PS1="\\w \\$ "',
  `[ -n "$BASH_VERSION" ] && [ -r ${COMPLETION} ] && . ${COMPLETION}`,
  'cat /etc/heph-welcome',
  '',
].join('\n');

export const RECIPE: Recipe = {
  packages: PACKAGES,
  files: [
    { path: '/opt/heph/lib/compat.c', content: COMPAT_SHIM },
    { path: '/usr/local/bin/heph', content: WRAPPER, mode: 0o755 },
    { path: '/etc/profile.d/heph.sh', content: PROFILE },
  ],
  commands: [`tcc -shared -nostdlib -o ${COMPAT_LIB} /opt/heph/lib/compat.c`],
};
