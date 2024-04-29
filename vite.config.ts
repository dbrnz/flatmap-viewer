import { glob } from 'glob'
import path from 'path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import { fileURLToPath } from 'node:url'
import { libInjectCss } from 'vite-plugin-lib-inject-css'

export default defineConfig({
  plugins: [
    dts({ include: ['lib'] }),
    libInjectCss()
  ],
  build: {
    copyPublicDir: false,
    cssCodeSplit: true,
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'FlatmapViewer',
      fileName: 'flatmapviewer',
      formats: ['es']
    },
    rollupOptions: {
      input: Object.fromEntries(
        // https://rollupjs.org/configuration-options/#input
        glob.sync('lib/**/*.{js,ts}').map(file => [
          // 1. The name of the entry point
          // lib/nested/foo.js becomes nested/foo
          path.relative(
            'lib',
            file.slice(0, file.length - path.extname(file).length)
          ),
          // 2. The absolute path to the entry file
          // lib/nested/foo.ts becomes /project/lib/nested/foo.ts
          fileURLToPath(new URL(file, import.meta.url))
        ])
      ),
      output: {
        assetFileNames: 'assets/[name][extname]',
        entryFileNames: '[name].js',
      }
    }
  },
})
