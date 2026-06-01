import { ConfigProvider } from 'antd';
import type { PropsWithChildren, ReactElement } from 'react';
import { hephTheme } from '../theme';

/**
 * Root provider for any heph surface. Wrap your app once and every proxied
 * component inherits the Blueprint theme. This is the only place that touches
 * antd's `ConfigProvider`, so swapping the design system later is a one-file
 * change.
 */
export function UIKitProvider({ children }: PropsWithChildren): ReactElement {
  return <ConfigProvider theme={hephTheme}>{children}</ConfigProvider>;
}
