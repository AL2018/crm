import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { lucideIcons } from 'frappe-ui/vite'
import path from 'path'

export default defineConfig({
  // Single-file components are compiled for the test run the same way the build compiles them.
  // Without this the runner can only reach plain `.js` utilities — which is why the attention
  // surface's rendering went uncovered when the desk page (and its executing probe) was retired.
  // See `CC-BRIEF-ATTENTION-V2` rev 3 §11.
  // ⚠️ WITHOUT `lucideIcons` NO TEST IN THIS REPO CAN MOUNT A REAL frappe-ui INPUT, and that is
  // not a convenience — it is a blind spot with a shape. Importing one fails at transform with
  // `Failed to resolve import "~icons/lucide/chevron-down"`, so every test that wanted to assert
  // something about an input had to stub it, and a stub can only ever confirm what the stub does.
  // That is exactly how `7427eb7e` shipped: its width assertions measured a stubbed `<select>`
  // while the page rendered a `<button role="combobox">` carrying the `w-full` that caused the
  // defect, and the test stayed green through it. This is the library's OWN plugin, the same one
  // `vite.config.js` gets from `frappeui()`, so a mounted component is the one that ships.
  plugins: [vue(), lucideIcons()],
  test: {
    globals: true,
    environment: 'happy-dom',
    root: __dirname,
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.js', 'src/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: [
        'src/utils/fieldTransforms.js',
        'src/utils/scriptHelpers.js',
        'src/utils/expressions.js',
        'src/utils/renderFieldLayoutDialog.js',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // ⚠️ THE LIBRARY'S OWN SOURCE, REACHABLE BY A TEST. `frappe-ui`'s `exports` map does not
      // publish `./src/*`, and its barrel drags in a module the runner cannot resolve, so a test
      // could reach the real components by neither route. In the app the `barrelImports` plugin
      // rewrites `from 'frappe-ui'` to these same files; this alias is that rewrite, done once,
      // for tests that must assert what the shipped component renders rather than what a stub does.
      'frappe-ui/src': path.resolve(__dirname, 'node_modules/frappe-ui/src'),
    },
  },
})
