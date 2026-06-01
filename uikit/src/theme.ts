import type { ThemeConfig } from 'antd';

/**
 * heph "Blueprint" theme for Ant Design.
 *
 * This is the single place the brand is wired into antd's theming facility:
 * change a token here and every proxied component across every surface
 * (website, docs, dashboard) updates. The values mirror `styles/tokens.css`
 * so the antd-rendered controls sit seamlessly next to the bespoke blueprint
 * primitives.
 */
export const hephTheme: ThemeConfig = {
  token: {
    // Cobalt is the one true accent — links, focus, primary intent.
    colorPrimary: '#2d5bff',
    colorInfo: '#2d5bff',
    colorLink: '#2d5bff',
    colorLinkHover: '#5a7dff',
    colorLinkActive: '#2447d6',
    colorSuccess: '#16a36a',
    colorWarning: '#c8920f',
    colorError: '#d6494e',

    // Ink ramp + near-white surfaces.
    colorText: '#0b0c0f',
    colorTextSecondary: '#2c2f36',
    colorTextTertiary: '#797d86',
    colorTextQuaternary: '#a6a9b0',
    colorBorder: '#e9e9ec',
    colorBorderSecondary: '#f1f1f4',
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorBgLayout: '#ffffff',

    // Engineered, tight radii — pills are reserved for status badges only.
    borderRadius: 6,
    borderRadiusLG: 10,
    borderRadiusSM: 4,
    borderRadiusXS: 2,

    // IBM Plex pairing: Sans for UI, Mono for the technical voice.
    fontFamily: "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif",
    fontFamilyCode: "'IBM Plex Mono', ui-monospace, 'SF Mono', monospace",
    fontSize: 15,

    // Always-visible cobalt focus ring.
    controlOutline: 'rgba(45, 91, 255, 0.30)',
    controlOutlineWidth: 3,

    wireframe: false,
  },
  components: {
    Button: {
      borderRadius: 0,
      borderRadiusLG: 0,
      borderRadiusSM: 0,
      primaryShadow: 'none',
      defaultShadow: 'none',
      fontWeight: 500,
    },
    Tooltip: {
      borderRadius: 4,
      colorBgSpotlight: '#0b0c0f',
      fontSize: 12,
    },
    Typography: {
      titleMarginTop: 0,
      titleMarginBottom: 0,
    },
  },
};
