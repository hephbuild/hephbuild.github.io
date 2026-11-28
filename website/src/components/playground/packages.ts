/**
 * The Alpine packages the playground VM installs. Shared by the page (vm.ts)
 * and the build step that mirrors them onto this site
 * (plugins/playground-vm): the VM installs from that mirror, never from the
 * internet.
 */

// heph and its plugins are glibc builds; Alpine is musl. gcompat bridges the
// two, libgcc carries the unwinder, bash backs the `bash` driver. tcc builds
// the compat shim and the C examples, with musl-dev for the libc headers.
// patchelf links the shim into the heph binary.
export const PACKAGES = [
  'gcompat', 'libgcc', 'libstdc++', 'bash', 'coreutils',
  'tcc', 'tcc-libs', 'tcc-libs-static', 'musl-dev', 'patchelf',
];

/** The release branch of the Alpine image unkernel boots (its /etc/alpine-release). */
export const ALPINE_BRANCH = 'v3.24';
export const ALPINE_REPOS = ['main', 'community'];
export const ALPINE_ARCH = 'aarch64';

/**
 * Where the mirror is served on this site. It keeps the upstream layout
 * below it: `<MIRROR_PATH>/alpine/<branch>/<repo>/<arch>/<file>`.
 */
export const MIRROR_PATH = '/playground/apk';

/** The VM's root file system, copied from the unkernel release at build time. */
export const DISTRO_PATH = '/playground/alpine.erofs';
