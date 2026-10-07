import type { ReactNode } from 'react';
import Layout from '@theme/Layout';
import BrowserOnly from '@docusaurus/BrowserOnly';
import { Playground } from '../components/playground/Playground';

/**
 * Try heph in the browser: an arm64 Alpine VM with the chosen heph release and
 * its plugins installed. The VM and terminal only exist client-side, and their
 * libraries are imported lazily when the visitor starts the VM.
 */
export default function PlaygroundPage(): ReactNode {
  return (
    <Layout
      title="Playground"
      description="Run heph in your browser — a Linux VM with heph, its plugins and examples, no install."
    >
      <BrowserOnly>{() => <Playground />}</BrowserOnly>
    </Layout>
  );
}
