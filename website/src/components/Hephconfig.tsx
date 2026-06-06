import type { ReactNode } from 'react';
import CodeBlock from '@theme/CodeBlock';
import { useLatestVersion } from '../hooks/useLatestVersion';

/**
 * Renders a `.hephconfig` whose first line pins the latest heph version resolved
 * by `useLatestVersion` (falling back to `latest` while loading). Any children
 * are appended verbatim, letting the caller tack on extra config.
 */
export default function Hephconfig({ children }: { children?: ReactNode }) {
  const { version } = useLatestVersion();
  const pinned = version ?? 'latest';
  const extra = typeof children === 'string' ? children.replace(/\n+$/, '') : '';
  return (
    <CodeBlock language="yaml" title=".hephconfig">
      {`version: ${pinned}${extra ? `\n${extra}` : ''}`}
    </CodeBlock>
  );
}
