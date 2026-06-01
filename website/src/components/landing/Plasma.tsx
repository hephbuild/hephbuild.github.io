/* eslint-disable no-bitwise, no-plusplus, no-continue, no-mixed-operators */
import { useEffect, useRef, type ReactElement } from 'react';

/* Generative ASCII plasma — a real demoscene plasma field rendered as monospace
   glyphs on <canvas>. On-brand: deterministic from a seed (same seed + frame =>
   identical field, byte for byte), drawn in the steel ramp with a single cobalt
   accent on the peaks. Here it is used as a faint ambient texture behind the
   whole page. Interactive: the cursor warps the field, a click drops an
   expanding ripple. Respects prefers-reduced-motion.

   The hot loop disables a handful of lint rules (bitwise floor, ++ counters,
   continue, mixed math) deliberately — this is performance-sensitive canvas
   code where the idiomatic form is the readable one. */

type RampName = 'fade' | 'blocks' | 'dots';
type Mode = 'dark' | 'light';

// density ramps — sparse -> dense. Default "fade" is a smooth, low-key gradient.
const PLASMA_RAMPS: Record<RampName, string> = {
  fade: ' .-=+*#%',
  blocks: ' .·:-=+▒▓',
  dots: '  .·:•◦●',
};

// quantized palettes (low -> high). Tight mid-gray range — quiet, no bright whites.
const PLASMA_PALETTES: Record<Mode, string[]> = {
  dark: ['#202329', '#2b2f36', '#373c44', '#464c55', '#565c66', '#676d77', '#7c828c'],
  light: ['#f3f4f6', '#ebedf0', '#e2e4e8', '#d6d9de', '#c9ccd2'],
};
const PLASMA_ACCENT: Record<Mode, string> = { dark: '#3f6bff', light: '#9fb2ff' };
const PLASMA_BG = '#08090b';

interface PlasmaProps {
  dark?: boolean;
  height?: number;
  cell?: number;
  speed?: number;
  interactive?: boolean;
  accent?: boolean;
  ramp?: RampName;
  opacity?: number;
  paused?: boolean;
  seed?: number;
  warp?: number;
  passthrough?: boolean;
}

interface PlasmaParams {
  dark: boolean;
  cell: number;
  speed: number;
  interactive: boolean;
  accent: boolean;
  ramp: RampName;
  paused: boolean;
  seed: number;
  warp: number;
}

interface Ripple { x: number; y: number; t0: number; }
interface PlasmaState {
  mouse: { x: number; y: number; on: boolean };
  ripples: Ripple[];
  frozenT: number;
  last: number;
  p: PlasmaParams;
}

type Cell = [number, number, string];

export function Plasma({
  dark = false,
  height = 360,
  cell = 13,
  speed = 1,
  interactive = true,
  accent = true,
  ramp = 'blocks',
  opacity = 1,
  paused = false,
  seed = 0,
  warp = 1,
  passthrough = false,
}: PlasmaProps): ReactElement {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const st = useRef<PlasmaState>({
    mouse: { x: -9999, y: -9999, on: false },
    ripples: [],
    frozenT: 0,
    last: 0,
    p: {
      dark, cell, speed, interactive, accent, ramp, paused, seed, warp,
    },
  });
  st.current.p = {
    dark, cell, speed, interactive, accent, ramp, paused, seed, warp,
  };

  useEffect(() => {
    const wrapMaybe = wrapRef.current;
    const canvasMaybe = canvasRef.current;
    if (!wrapMaybe || !canvasMaybe) return undefined;
    const ctxMaybe = canvasMaybe.getContext('2d', { alpha: true });
    if (!ctxMaybe) return undefined;
    // Pin non-null declared types so the narrowing survives into the nested
    // resize/draw/loop closures (TS otherwise re-widens to the union there).
    const wrap: HTMLDivElement = wrapMaybe;
    const canvas: HTMLCanvasElement = canvasMaybe;
    const ctx: CanvasRenderingContext2D = ctxMaybe;

    const S = st.current;
    const reduce = window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let charW = 8;
    let lineH = 15;
    let cols = 0;
    let rows = 0;

    function resize(): void {
      const r = wrap.getBoundingClientRect();
      w = Math.max(1, r.width);
      h = Math.max(1, r.height || height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const fpx = S.p.cell;
      ctx.font = `${fpx}px "IBM Plex Mono", ui-monospace, monospace`;
      ctx.textBaseline = 'top';
      charW = ctx.measureText('█').width || fpx * 0.6;
      lineH = Math.round(fpx * 1.16);
      cols = Math.ceil(w / charW) + 1;
      rows = Math.ceil(h / lineH) + 1;
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    function draw(t: number): void {
      const { p } = S;
      const mode: Mode = p.dark ? 'dark' : 'light';
      const pal = PLASMA_PALETTES[mode];
      const accentCol = PLASMA_ACCENT[mode];
      const chars = PLASMA_RAMPS[p.ramp] || PLASMA_RAMPS.blocks;
      const L = pal.length;

      ctx.clearRect(0, 0, w, h);
      if (p.dark) {
        ctx.fillStyle = PLASMA_BG;
        ctx.fillRect(0, 0, w, h);
      }

      const sx = 0.020;
      const ph = p.seed * 0.613; // spatial frequency + seed phase
      const cx = w * (0.5 + 0.26 * Math.sin(t * 0.31 + ph));
      const cy = h * (0.5 + 0.28 * Math.cos(t * 0.27 + ph * 1.3));
      const { mouse: m, ripples } = S;

      // bucket cells by colour level so we set fillStyle ~L times, not per cell
      const buckets: Cell[][] = Array.from({ length: L + 1 }, () => []); // +1 = accent
      for (let gy = 0; gy < rows; gy++) {
        const py = gy * lineH;
        for (let gx = 0; gx < cols; gx++) {
          const px = gx * charW;
          let v = Math.sin(px * sx + t * 1.0 + ph)
            + Math.sin((px * 0.012 + py * 0.021) + t * 0.7) // diagonal
            + Math.sin((py * 0.018 - px * 0.010) - t * 0.5 + ph) // anti-diagonal
            + Math.sin(Math.hypot(px - cx, py - cy) * 0.030 - t * 1.1);

          // cursor warp
          if (m.on && p.interactive) {
            const d = Math.hypot(px - m.x, py - m.y);
            v += Math.exp(-d / 130) * Math.sin(d * 0.06 - t * 4.2) * 2.0 * p.warp;
          }
          // click ripples
          for (let ri = 0; ri < ripples.length; ri += 1) {
            const rp = ripples[ri];
            if (!rp) continue;
            const age = t - rp.t0;
            const d = Math.hypot(px - rp.x, py - rp.y);
            v += Math.sin(d * 0.05 - age * 7) * Math.exp(-age * 1.5) * Math.exp(-d / 320) * 2.6;
          }

          const inten = 0.5 + 0.5 * Math.sin(v); // bounded, cyclic
          const shaped = inten ** 1.25; // gentle gamma, stays full & smooth
          const ci = Math.min(chars.length - 1, (shaped * chars.length) | 0);
          const ch = chars[ci] ?? ' ';
          if (ch === ' ') continue;
          const lvl = Math.min(L - 1, (shaped * L) | 0);
          const isPeak = p.accent && inten > 0.95; // very rare crest sparkle
          (isPeak ? buckets[L] : buckets[lvl])?.push([px, py, ch]);
        }
      }
      for (let b = 0; b <= L; b++) {
        const arr = buckets[b];
        if (!arr || !arr.length) continue;
        ctx.fillStyle = b === L ? accentCol : (pal[b] ?? accentCol);
        for (let ci2 = 0; ci2 < arr.length; ci2 += 1) {
          const cellv = arr[ci2];
          if (cellv) ctx.fillText(cellv[2], cellv[0], cellv[1]);
        }
      }
      // age out ripples
      if (ripples.length) S.ripples = ripples.filter((rp) => t - rp.t0 < 2.4);
    }

    function loop(now: number): void {
      raf = requestAnimationFrame(loop);
      if (now - S.last < 33) return; // ~30fps cap
      S.last = now;
      const { p } = S;
      let t: number;
      if (p.paused || reduce) {
        t = S.frozenT;
      } else {
        t = now * 0.001 * p.speed;
        S.frozenT = t;
      }
      draw(t);
    }
    raf = requestAnimationFrame(loop);

    // interaction (background plasmas use passthrough: listen on window, never
    // capture pointer events so clicks fall through to the page)
    const target: EventTarget = passthrough ? window : wrap;
    function toLocal(e: PointerEvent): { x: number; y: number } {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function onMove(e: PointerEvent): void {
      const l = toLocal(e);
      S.mouse.x = l.x;
      S.mouse.y = l.y;
      S.mouse.on = true;
    }
    function onLeave(): void {
      S.mouse.on = false;
    }
    function onDown(e: PointerEvent): void {
      const l = toLocal(e);
      S.ripples.push({ x: l.x, y: l.y, t0: S.frozenT });
    }
    if (interactive) {
      target.addEventListener('pointermove', onMove as EventListener);
      target.addEventListener('pointerleave', onLeave);
      if (!passthrough) target.addEventListener('pointerdown', onDown as EventListener);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      target.removeEventListener('pointermove', onMove as EventListener);
      target.removeEventListener('pointerleave', onLeave);
      if (!passthrough) target.removeEventListener('pointerdown', onDown as EventListener);
    };
  }, [height, interactive, passthrough]);

  return (
    <div
      ref={wrapRef}
      style={{
        position: 'absolute',
        inset: 0,
        height,
        opacity,
        pointerEvents: !interactive || passthrough ? 'none' : 'auto',
      }}
    >
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
}
