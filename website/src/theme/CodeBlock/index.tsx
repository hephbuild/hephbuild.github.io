import type { ReactNode } from 'react';
import CodeBlock from '@theme-original/CodeBlock';
import Admonition from '@theme/Admonition';
import type CodeBlockType from '@theme/CodeBlock';
import type { WrapperProps } from '@docusaurus/types';
import { useLatestVersion, RELEASES_PAGE_URL } from '../../hooks/useLatestVersion';

type Props = WrapperProps<typeof CodeBlockType>;

// Shown in place of the version when resolution fails — the reader swaps it out.
const VERSION_PLACEHOLDER = '<VERSION>';

// Language arrives as the `language` prop (JSX) or a `language-xxx` className
// (markdown code fence).
function resolveLanguage(props: Props): string | undefined {
  if (typeof props.language === 'string') return props.language;
  if (typeof props.className === 'string') {
    const m = props.className.match(/language-(\w+)/);
    if (m) return m[1];
  }
  return undefined;
}

// Title can arrive parsed (`title` prop, JSX usage) or raw inside the code-fence
// metastring (`title="..."`, markdown usage). Resolve both.
function resolveTitle(props: Props): string | undefined {
  if (typeof props.title === 'string') return props.title;
  if (typeof props.metastring === 'string') {
    const m = props.metastring.match(/title="([^"]*)"|title='([^']*)'/);
    if (m) return m[1] ?? m[2];
  }
  return undefined;
}

/**
 * Wraps the theme `CodeBlock`: for a yaml block titled `.hephconfig`, substitutes
 * the latest released heph version into the source — `<HEPH_VERSION>` becomes the
 * raw version and `<HEPH_VERSION_URL>` its URL-encoded form. While loading it
 * falls back to `latest`; if resolution fails it renders an error notice above
 * the block and shows `<VERSION>` as a placeholder. Other blocks pass through.
 */
export default function CodeBlockWrapper(props: Props): ReactNode {
  const { version, error } = useLatestVersion();
  const { children } = props;

  if (
    resolveLanguage(props) === 'yaml'
    && resolveTitle(props) === '.hephconfig'
    && typeof children === 'string'
  ) {
    const v = error ? VERSION_PLACEHOLDER : (version ?? 'latest');
    const code = children
      .replace(/<HEPH_VERSION>/g, v)
      .replace(/<HEPH_VERSION_URL>/g, encodeURIComponent(v));
    return (
      <>
        {error && (
          <Admonition type="danger" title="Could not resolve the latest version">
            <p>
              Open the
              {' '}
              <a href={RELEASES_PAGE_URL} target="_blank" rel="noreferrer">
                releases page
              </a>
              {' '}
              and replace
              {' '}
              <code>{VERSION_PLACEHOLDER}</code>
              {' '}
              below with the latest tag.
            </p>
          </Admonition>
        )}
        <CodeBlock {...props}>{code}</CodeBlock>
      </>
    );
  }

  return <CodeBlock {...props} />;
}
