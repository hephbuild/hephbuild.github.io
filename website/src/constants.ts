// Single source of truth for the heph GitHub repository URL, shared by the
// Docusaurus config (build time) and the landing components (runtime).
export const GITHUB_URL = 'https://github.com/hephbuild/heph';
export const GITHUB_DOCS_URL = 'https://github.com/hephbuild/hephbuild.github.io';

// Bare host/path form for display (no protocol).
export const GITHUB_LABEL = GITHUB_URL.replace('https://', '');

// CORS proxy prefix the /playground page puts in front of GitHub release asset
// URLs (GitHub serves release downloads without CORS headers). Deployed from
// infra/playground-proxy. Overridable per visit with `?proxy=<prefix>`.
export const PLAYGROUND_PROXY = 'https://proxy.hephbuild.workers.dev/heph-release?';
