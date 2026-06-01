/**
 * OpenGraph image renderers for @kas-tle/docusaurus-og.
 *
 * Renders the heph "Blueprint" social card with Vercel Satori: paper-white
 * canvas, faint engineering grid, registration crosses pinned to the corners,
 * the `//` slash mark + wordmark, IBM Plex pairing (Sans for the title, Mono
 * for the technical voice), and the one true cobalt accent (#2d5bff). Mirrors
 * `uikit/src/styles/tokens.css` so a shared card reads as the same system as
 * the site chrome.
 *
 * Authored with `React.createElement` (no JSX) so the module imports straight
 * into `docusaurus.config.ts` with no extra compile step — Satori consumes the
 * element tree directly, then resvg rasterises it to PNG at build time.
 */
import React from 'react';
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import {
  imageRendererFactory,
  type DocsPageData,
  type PageData,
} from '@kas-tle/docusaurus-og';

const h = React.createElement;

// --- Brand tokens (subset of uikit tokens.css) -----------------------------
const INK = '#0b0c0f';
const INK_2 = '#2c2f36';
const MUTED = '#797d86';
const FAINT = '#a6a9b0';
const ACCENT = '#2d5bff';
const VERIFY = '#16a36a';
const PAPER = '#ffffff';
const GRID = '#f1f1f4';
const HAIR_STRONG = '#d4d5da';

// --- Fonts -----------------------------------------------------------------
// Loaded from @fontsource at build time. Satori reads .woff/.ttf/.otf but NOT
// .woff2, so we resolve the .woff variant each package ships alongside it.
const require = createRequire(import.meta.url);
const font = (pkg: string, file: string) => readFileSync(require.resolve(`${pkg}/files/${file}`));

const FONTS = [
  {
    name: 'IBM Plex Sans', data: font('@fontsource/ibm-plex-sans', 'ibm-plex-sans-latin-400-normal.woff'), weight: 400 as const, style: 'normal' as const,
  },
  {
    name: 'IBM Plex Sans', data: font('@fontsource/ibm-plex-sans', 'ibm-plex-sans-latin-600-normal.woff'), weight: 600 as const, style: 'normal' as const,
  },
  {
    name: 'IBM Plex Mono', data: font('@fontsource/ibm-plex-mono', 'ibm-plex-mono-latin-400-normal.woff'), weight: 400 as const, style: 'normal' as const,
  },
  {
    name: 'IBM Plex Mono', data: font('@fontsource/ibm-plex-mono', 'ibm-plex-mono-latin-500-normal.woff'), weight: 500 as const, style: 'normal' as const,
  },
];

const SANS = 'IBM Plex Sans';
const MONO = 'IBM Plex Mono';

// --- Inline SVG marks as data URIs (Satori rasterises <img> reliably) ------
const dataUri = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`;

/** The `//` slash mark — ink + cobalt, matching static/img/logo.svg. */
const markUri = dataUri(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64' width='64' height='64'>"
    + `<line x1='16' y1='47' x2='31' y2='17' stroke='${INK}' stroke-width='8' stroke-linecap='square'/>`
    + `<line x1='33' y1='47' x2='48' y2='17' stroke='${ACCENT}' stroke-width='8' stroke-linecap='square'/>`
    + '</svg>',
);

/** Technical registration cross "+". */
const crossUri = (color: string, size = 24) => dataUri(
  `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'>`
      + `<line x1='${size / 2}' y1='0' x2='${size / 2}' y2='${size}' stroke='${color}' stroke-width='1.5'/>`
      + `<line x1='0' y1='${size / 2}' x2='${size}' y2='${size / 2}' stroke='${color}' stroke-width='1.5'/>`
      + '</svg>',
);

// --- Small element builders ------------------------------------------------
const img = (src: string, size: number, style: React.CSSProperties = {}) => h('img', {
  src, width: size, height: size, style: { display: 'block', ...style },
});

/** Corner registration crosses, accent in the top-left like the site chrome. */
function corners() {
  const pad = 40;
  const spots: Array<[React.CSSProperties, boolean]> = [
    [{ top: pad, left: pad }, true],
    [{ top: pad, right: pad }, false],
    [{ bottom: pad, left: pad }, false],
    [{ bottom: pad, right: pad }, false],
  ];
  return spots.map(([pos, accent], i) => h('img', {
    key: `c${i}`,
    src: crossUri(accent ? ACCENT : HAIR_STRONG, 22),
    width: 22,
    height: 22,
    style: { position: 'absolute', ...pos },
  }));
}

/** Vertical tick ruler down the left margin — the blueprint gutter. */
function ruler() {
  const ticks = Array.from({ length: 11 }).map((_, i) => h('div', {
    key: `t${i}`,
    style: { width: i % 2 ? 7 : 13, height: 1, background: HAIR_STRONG },
  }));
  return h(
    'div',
    {
      style: {
        position: 'absolute',
        left: 40,
        top: 0,
        bottom: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 22,
      },
    },
    ...ticks,
  );
}

/** Header: slash mark + wordmark on the left, site host on the right. */
function header() {
  const logo = h(
    'div',
    { style: { display: 'flex', alignItems: 'center', gap: 16 } },
    img(markUri, 46),
    h(
      'div',
      {
        style: {
          fontFamily: SANS,
          fontWeight: 600,
          fontSize: 40,
          letterSpacing: '-0.035em',
          color: INK,
        },
      },
      'heph',
    ),
  );
  const host = h(
    'div',
    {
      style: {
        fontFamily: MONO, fontSize: 18, color: MUTED, letterSpacing: '0.02em',
      },
    },
    'hephbuild.github.io',
  );
  return h(
    'div',
    { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
    logo,
    host,
  );
}

function titleSize(title: string) {
  const n = title.length;
  if (n <= 22) return 76;
  if (n <= 38) return 62;
  if (n <= 58) return 50;
  return 42;
}

function clamp(text: string, max: number) {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

interface CardOpts {
  eyebrow: string;
  title: string;
  description?: string;
  coord: string;
}

/** Shared blueprint card layout. */
function card({
  eyebrow, title, description, coord,
}: CardOpts) {
  const eyebrowEl = h(
    'div',
    { style: { display: 'flex', alignItems: 'center', gap: 12 } },
    img(crossUri(ACCENT, 16), 16),
    h(
      'div',
      {
        style: {
          fontFamily: MONO,
          fontWeight: 500,
          fontSize: 19,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: ACCENT,
        },
      },
      eyebrow,
    ),
  );

  const titleEl = h(
    'div',
    {
      style: {
        fontFamily: SANS,
        fontWeight: 600,
        fontSize: titleSize(title),
        lineHeight: 1.04,
        letterSpacing: '-0.03em',
        color: INK,
      },
    },
    title,
  );

  const children: React.ReactNode[] = [eyebrowEl, titleEl];
  if (description) {
    children.push(
      h(
        'div',
        {
          style: {
            fontFamily: SANS,
            fontWeight: 400,
            fontSize: 26,
            lineHeight: 1.45,
            color: INK_2,
            maxWidth: 880,
          },
        },
        clamp(description, 150),
      ),
    );
  }

  // Cobalt accent rule down the left edge of the headline block.
  const main = h(
    'div',
    {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
        borderLeft: `3px solid ${ACCENT}`,
        paddingLeft: 30,
      },
    },
    ...children,
  );

  const footer = h(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontFamily: MONO,
        fontSize: 17,
      },
    },
    h(
      'div',
      {
        style: {
          display: 'flex', alignItems: 'center', gap: 12, color: MUTED,
        },
      },
      h('div', {
        style: {
          width: 9, height: 9, background: VERIFY, borderRadius: 2,
        },
      }),
      'Build once. Trust the cache.',
    ),
    h('div', { style: { color: FAINT, letterSpacing: '0.04em' } }, coord),
  );

  return h(
    'div',
    {
      style: {
        width: 1200,
        height: 630,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        padding: '76px 84px',
        paddingLeft: 96,
        backgroundColor: PAPER,
        backgroundImage: `linear-gradient(${GRID} 1px, transparent 1px), linear-gradient(90deg, ${GRID} 1px, transparent 1px)`,
        backgroundSize: '48px 48px',
        fontFamily: SANS,
      },
    },
    ...corners(),
    ruler(),
    header(),
    main,
    footer,
  );
}

const SATORI_OPTS = { width: 1200, height: 630, fonts: FONTS };

/** Derive an uppercase section label from a docs permalink. */
function docsEyebrow(permalink: string) {
  const segs = permalink.split('/').filter(Boolean); // e.g. ['docs','guides','caching']
  const cat = (segs.length >= 3 ? segs[1] : 'documentation') ?? 'documentation';
  return cat.replace(/[-_]/g, ' ').toUpperCase();
}

function lastSeg(permalink: string) {
  const segs = permalink.split('/').filter(Boolean);
  return segs[segs.length - 1] ?? '';
}

const TAGLINE = 'Build once. Trust the cache.';

export const ogDocs = imageRendererFactory(
  'docusaurus-plugin-content-docs',
  (data: DocsPageData) => {
    const { metadata } = data;
    return [
      card({
        eyebrow: docsEyebrow(metadata.permalink),
        title: metadata.title,
        description: metadata.description || TAGLINE,
        coord: `//docs:${lastSeg(metadata.permalink) || 'index'}`,
      }),
      SATORI_OPTS,
    ];
  },
);

export const ogPages = imageRendererFactory(
  'docusaurus-plugin-content-pages',
  (data: PageData) => {
    const { metadata } = data;
    const isHome = metadata.permalink === '/';
    return [
      card({
        eyebrow: isHome ? 'OPEN-SOURCE BUILD SYSTEM' : 'HEPH',
        title: isHome ? TAGLINE : metadata.title,
        description: metadata.description
          || (isHome
            ? 'Hermetic, content-addressed builds with a cache you can trust — across every language and target.'
            : undefined),
        coord: isHome ? '//heph' : `//${lastSeg(metadata.permalink) || 'page'}`,
      }),
      SATORI_OPTS,
    ];
  },
);
