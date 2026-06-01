// @heph/uikit — the heph "Blueprint" component library.
//
// A thin, swappable proxy layer over Ant Design plus a small set of bespoke
// blueprint primitives. Consumers import everything from here and never reach
// for `antd` or `lucide-react` directly, so the design system stays a one-file
// swap away.

import './styles/tokens.css';

// Theme + provider (antd's theming facility, wired to the Blueprint tokens).
export { hephTheme } from './theme';
export { UIKitProvider } from './provider/UIKitProvider';

// Proxied antd components.
export { Button } from './components/Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './components/Button';
export { Icon } from './components/Icon';
export type { IconProps, IconName } from './components/Icon';
export { Title, Text, Paragraph } from './components/Typography';
export { Flex } from './components/Flex';
export type { FlexProps } from './components/Flex';
export { Tooltip } from './components/Tooltip';
export type { TooltipProps } from './components/Tooltip';

// Bespoke blueprint primitives.
export { Cross, Corners } from './primitives/Cross';
export type { CrossProps, CornersProps } from './primitives/Cross';
export { Glyph, Logo } from './primitives/Logo';
export type {
  GlyphProps, GlyphName, LogoProps,
} from './primitives/Logo';
export { Eyebrow } from './primitives/Eyebrow';
export type { EyebrowProps } from './primitives/Eyebrow';
export { Coord } from './primitives/Coord';
export type { CoordProps } from './primitives/Coord';
export { Dim } from './primitives/Dim';
export type { DimProps } from './primitives/Dim';
export { Ruler } from './primitives/Ruler';
export type { RulerProps } from './primitives/Ruler';
