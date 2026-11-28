import type { KernelInstance, Pty } from 'unkernel';
import type { ITerminalOptions, Terminal } from '@xterm/xterm';
import { openShell } from './vm';

export interface AttachedTerminal {
  readonly xterm: Terminal;
  /** Type into the shell. */
  write(text: string): void;
  /** Close the shell and remove the terminal. The VM keeps running. */
  dispose(): void;
}

/**
 * Show a login shell of `vm` in `element`, sized to it. When the shell
 * exits (`exit`, Ctrl-D) a new one takes its place.
 */
export async function attachTerminal(
  vm: KernelInstance,
  element: HTMLElement,
  options: ITerminalOptions,
): Promise<AttachedTerminal> {
  const [{ Terminal: XTerm }, { FitAddon }] = await Promise.all([
    import('@xterm/xterm'),
    import('@xterm/addon-fit'),
  ]);
  const xterm = new XTerm(options);
  const fit = new FitAddon();
  xterm.loadAddon(fit);
  xterm.open(element);
  fit.fit();

  let disposed = false;
  let pty: Pty | null = null;
  const encoder = new TextEncoder();

  // Resolves once the shell runs; its output is piped in the background.
  const spawn = async (): Promise<void> => {
    const shell = await openShell(vm, xterm.cols, xterm.rows);
    if (disposed) {
      shell.close().catch(() => {});
      return;
    }
    pty = shell;
    shell.output
      .pipeTo(new WritableStream({ write: (bytes) => { xterm.write(bytes); } }))
      .catch(() => {})
      .then(() => {
        pty = null;
        if (disposed) return;
        xterm.write('\r\n[shell exited, starting a new one]\r\n');
        spawn().catch(() => {});
      });
  };

  const onData = xterm.onData((data) => { pty?.write(encoder.encode(data)).catch(() => {}); });
  const onResize = xterm.onResize(({ cols, rows }) => pty?.resize(cols, rows));
  // The element is hidden until the VM is ready: a zero-size fit is skipped.
  const observer = new ResizeObserver(() => {
    if (element.clientWidth && element.clientHeight) fit.fit();
  });
  observer.observe(element);

  await spawn().catch((e: unknown) => {
    observer.disconnect();
    onData.dispose();
    onResize.dispose();
    xterm.dispose();
    throw e;
  });

  return {
    xterm,
    write(text) { pty?.write(text).catch(() => {}); },
    dispose() {
      disposed = true;
      observer.disconnect();
      onData.dispose();
      onResize.dispose();
      pty?.close().catch(() => {});
      xterm.dispose();
    },
  };
}
