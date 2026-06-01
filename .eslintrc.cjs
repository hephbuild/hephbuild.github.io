/* Root ESLint config — strict, Airbnb preset, TypeScript-only. */
module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
    project: true,
  },
  plugins: ['@typescript-eslint', 'react', 'react-hooks', 'jsx-a11y', 'import'],
  extends: [
    'airbnb',
    'airbnb-typescript',
    'airbnb/hooks',
  ],
  settings: {
    react: { version: 'detect' },
    'import/resolver': {
      typescript: { project: ['uikit/tsconfig.json', 'website/tsconfig.json'] },
    },
  },
  rules: {
    // The new JSX transform makes the React import unnecessary.
    'react/react-in-jsx-scope': 'off',
    'react/require-default-props': 'off',
    // Inline style objects are intrinsic to this blueprint design system.
    'react/forbid-dom-props': 'off',
    'react/jsx-props-no-spreading': 'off',
    // Allow .tsx for components.
    'react/jsx-filename-extension': ['error', { extensions: ['.tsx'] }],
    // Default exports are required by Docusaurus pages/config.
    'import/prefer-default-export': 'off',
    'import/no-extraneous-dependencies': ['error', { devDependencies: true }],
  },
  ignorePatterns: [
    'node_modules',
    'dist',
    'build',
    '.docusaurus',
    '*.config.js',
    '*.cjs',
    '.devenv',
  ],
};
