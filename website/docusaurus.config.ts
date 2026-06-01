import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import type { PrismTheme } from 'prism-react-renderer';
import { GITHUB_URL } from './src/constants';
import { ogDocs, ogPages } from './src/og/render';

/**
 * Blueprint code-well theme — the docs UI kit renders code on dark inset wells
 * (`--bg-inset #0b0c0f`) with the brand's two signal hues: cobalt for keywords,
 * verify-green for strings, steel-faint for comments. We pin the lighter accent
 * steps (ac-400 / verify-400) so they stay legible on near-black, while reading
 * as the same cobalt + green from the mock.
 */
const blueprintCode: PrismTheme = {
  plain: { color: '#e6e7ea', backgroundColor: '#0b0c0f' },
  styles: [
    { types: ['comment', 'prolog', 'cdata'], style: { color: '#6b7080', fontStyle: 'italic' } },
    { types: ['keyword', 'builtin', 'boolean', 'rule', 'important', 'key', 'atrule'], style: { color: '#5a7dff' } },
    { types: ['string', 'char', 'attr-value', 'inserted', 'url'], style: { color: '#2bbd84' } },
    { types: ['number', 'constant', 'symbol'], style: { color: '#8aa3ff' } },
    { types: ['function', 'class-name', 'tag', 'selector'], style: { color: '#e6e7ea' } },
    { types: ['attr-name', 'property', 'variable'], style: { color: '#c4c6cc' } },
    { types: ['punctuation', 'operator'], style: { color: '#a6a9b0' } },
    { types: ['deleted'], style: { color: '#d6494e' } },
  ],
};

const config: Config = {
  title: 'heph',
  tagline: 'Build once. Trust the cache.',
  favicon: 'img/favicon.svg',

  // User/organization GitHub Pages site → served from the domain root.
  url: 'https://hephbuild.github.io',
  baseUrl: '/',
  organizationName: 'hephbuild',
  projectName: 'hephbuild.github.io',
  trailingSlash: false,

  onBrokenLinks: 'throw',

  // Binds "/" to focus the navbar search — the key-hint chip the blueprint
  // DocTopNav shows inside the search field.
  clientModules: ['./src/searchHotkey.ts'],

  // Client-side full-text search (lunr). The plugin crawls the built docs and
  // ships a static index, so search works on GitHub Pages with no backend. The
  // navbar search box it injects is restyled to the blueprint DocTopNav search
  // field (mono placeholder + "/" key hint) in src/css/custom.css.
  plugins: [
    [
      'docusaurus-lunr-search',
      {
        // The landing page ('/') is bespoke marketing chrome, not searchable
        // prose — keep the index scoped to the docs.
        excludeRoutes: ['/'],
      },
    ],
    // Blueprint OpenGraph cards, rendered per-page at build time (postBuild)
    // via Satori. PNGs land in build/img/og/ and the og:image / twitter:image
    // meta tags are rewritten to absolute URLs under `url`. See src/og/render.ts.
    [
      '@kas-tle/docusaurus-og',
      {
        path: 'img/og',
        imageRenderers: {
          'docusaurus-plugin-content-docs': ogDocs,
          'docusaurus-plugin-content-pages': ogPages,
        },
      },
    ],
  ],

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: 'docs',
          editUrl: `${GITHUB_URL}/tree/main/website/`,
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // The brand is a single light "Blueprint" language — no dark mode toggle.
    colorMode: {
      defaultMode: 'light',
      disableSwitch: true,
      respectPrefersColorScheme: false,
    },
    navbar: {
      title: 'heph',
      logo: {
        alt: 'heph',
        src: 'img/logo.svg',
      },
      items: [
        { to: '/docs', label: 'Docs', position: 'left' },
        // Search sits left, right after the wordmark — the blueprint DocTopNav
        // search field. (Without an explicit item Docusaurus auto-appends it to
        // the right; we want the kit's position.)
        { type: 'search', position: 'left' },
        {
          href: GITHUB_URL, label: 'Source', position: 'right', className: 'navbar-source',
        },
      ],
    },
    footer: {
      style: 'light',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Quickstart', to: '/docs' },
            { label: 'Targets & rules', to: '/docs/concepts/targets' },
            { label: 'Reproducibility', to: '/docs/concepts/reproducibility' },
            { label: 'CLI reference', to: '/docs/reference/cli' },
          ],
        },
        {
          title: 'Project',
          items: [
            { label: 'GitHub', href: GITHUB_URL },
            { label: 'License — MIT', href: `${GITHUB_URL}/blob/main/LICENSE` },
          ],
        },
      ],
      copyright: `© ${new Date().getFullYear()} heph labs · MIT`,
    },
    prism: {
      theme: blueprintCode,
      darkTheme: blueprintCode,
      additionalLanguages: ['bash', 'python', 'yaml', 'json'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
