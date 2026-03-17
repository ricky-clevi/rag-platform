import { defineConfig } from 'tsup';

export default defineConfig([
  // React component build (ESM + CJS)
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    external: ['react', 'react-dom'],
    outDir: 'dist',
    clean: true,
    outExtension({ format }) {
      return {
        js: format === 'esm' ? '.mjs' : '.cjs',
      };
    },
  },
  // IIFE embed build (standalone script with Preact)
  {
    entry: { embed: 'src/embed.ts' },
    format: ['iife'],
    // No globalName — embed.ts sets window.AgentForge programmatically
    // to avoid the IIFE wrapper overwriting the { open, close, toggle } API.
    outDir: 'dist',
    sourcemap: true,
    // Alias React -> Preact for smaller bundle
    esbuildOptions(options) {
      options.alias = {
        'react': 'preact/compat',
        'react-dom': 'preact/compat',
        'react-dom/client': 'preact/compat',
        'react/jsx-runtime': 'preact/jsx-runtime',
      };
    },
    // Inject CSS as string
    loader: {
      '.css': 'text',
    },
    noExternal: [/.*/],
  },
]);
