import type { ReactNode } from 'react';
import { UIKitProvider } from '@heph/uikit';
import '@heph/uikit/style.css';

/**
 * Docusaurus swizzles `Root` around the entire app (both SSR and hydration),
 * so this is where the uikit's antd theme provider and Blueprint tokens get
 * mounted once for every page — landing and docs alike.
 */
export default function Root({ children }: { children: ReactNode }): ReactNode {
  return <UIKitProvider>{children}</UIKitProvider>;
}
