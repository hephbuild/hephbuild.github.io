// Ambient declaration so TypeScript accepts side-effect CSS imports
// (e.g. `import './styles/tokens.css'`). The bundler (Vite) handles the asset;
// TS only needs to know the module exists.
declare module '*.css';
