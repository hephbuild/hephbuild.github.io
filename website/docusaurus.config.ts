import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import { themes as prismThemes } from 'prism-react-renderer';
import { GITHUB_URL } from './src/constants';

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
        { href: GITHUB_URL, label: 'GitHub', position: 'right' },
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
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'python'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
