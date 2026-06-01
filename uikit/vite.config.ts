import { resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';

// Library build: bundle the proxy layer, keep React/antd external so the host
// app (Docusaurus) provides a single copy.
export default defineConfig({
  plugins: [react(), dts({ bundleTypes: true, tsconfigPath: './tsconfig.json' })],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js',
      // Pin the emitted stylesheet name (Vite 8 defaults it to the package name).
      cssFileName: 'uikit',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime', 'antd', 'lucide-react'],
    },
    sourcemap: true,
  },
});
