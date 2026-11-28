/**
 * The playground VM's root file system, shared by the page (vm.ts) and the
 * build step that makes it (plugins/playground-vm): unkernel's Alpine image
 * with the packages and files below already installed, so a boot has
 * nothing left to install but heph itself.
 */

/** Where the image is served on this site: an erofs image, gzipped. */
export const IMAGE_PATH = '/playground/rootfs.erofs.gz';

export const HEPH_BIN = '/opt/heph/bin/heph';
/** The glibc symbols gcompat lacks; the page links it into the heph binary. */
export const COMPAT_LIB = '/opt/heph/lib/libhephcompat.so';
/** heph's bash completion, generated on the page by the installed release. */
export const COMPLETION = '/etc/heph-completion.bash';

/** What the build step tells the page, through Docusaurus global data. */
export interface ImageInfo {
  /** Bytes a first start downloads for the VM: the kernel and the image. */
  vmBytes: number;
}
