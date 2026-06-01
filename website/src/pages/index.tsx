import type { ReactNode } from 'react';
import Layout from '@theme/Layout';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import { Landing } from '../components/landing';

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={siteConfig.title}
      description="heph — open-source build system. Build once. Trust the cache."
    >
      <Landing />
    </Layout>
  );
}
