import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync } from 'fs';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        content: resolve(__dirname, 'src/content/index.ts'),
        background: resolve(__dirname, 'src/background/service-worker.ts'),
        popup: resolve(__dirname, 'src/popup/popup.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  plugins: [
    {
      name: 'copy-extension-files',
      writeBundle() {
        // Ensure dist directories exist
        if (!existsSync('dist/icons')) {
          mkdirSync('dist/icons', { recursive: true });
        }

        // Copy manifest
        copyFileSync('src/manifest.json', 'dist/manifest.json');

        // Copy popup HTML
        copyFileSync('src/popup/popup.html', 'dist/popup.html');

        // Copy icons if they exist
        ['icon16.png', 'icon48.png', 'icon128.png'].forEach((icon) => {
          const src = `public/icons/${icon}`;
          if (existsSync(src)) {
            copyFileSync(src, `dist/icons/${icon}`);
          }
        });
      },
    },
  ],
});
