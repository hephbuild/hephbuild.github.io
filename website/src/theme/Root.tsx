import type { ReactNode } from 'react';
import { UIKitProvider } from '@heph/uikit';

// Self-hosted IBM Plex (no Google Fonts CDN). Webpack emits the woff2 as
// separate cached assets and only the used weights are fetched. Weights mirror
// the design — 400/500/600/700 + 400 italic — for both Sans and Mono. The
// font-family tokens that consume these live in @heph/uikit's tokens.css.
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/ibm-plex-sans/400-italic.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/ibm-plex-mono/700.css';
import '@fontsource/ibm-plex-mono/400-italic.css';
import '@heph/uikit/style.css';

/**
 * Docusaurus swizzles `Root` around the entire app (both SSR and hydration),
 * so this is where the uikit's antd theme provider and Blueprint tokens get
 * mounted once for every page — landing and docs alike.
 */
export default function Root({ children }: { children: ReactNode }): ReactNode {
  return <UIKitProvider>{children}</UIKitProvider>;
}
