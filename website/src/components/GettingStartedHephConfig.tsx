import CodeBlock from '@theme/CodeBlock';
import { useLatestVersion } from '../hooks/useLatestVersion';

/**
 * Renders the minimal `.hephconfig`, pinned to the latest heph version resolved
 * by `useLatestVersion`. While the version is loading it falls back to
 * `latest`. (Mirrors hephbuild/heph's GettingStartedHephConfig component.)
 */
export default function GettingStartedHephConfig() {
  const { version } = useLatestVersion();
  const pinned = version ?? 'latest';
  return (
    <CodeBlock language="yaml" title=".hephconfig">
      {`version: ${pinned}`}
    </CodeBlock>
  );
}
