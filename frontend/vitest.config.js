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
  // ⚠️ IT IS THREE PLUGINS, NOT ONE, AND ONE OF THEM WRITES A TRACKED FILE. `lucideIcons()`
  // returns `[AutoImport, Components, LucideIconsPlugin]`, and `unplugin-vue-components` defaults
  // to `dts: true` — so a test run regenerates `frontend/auto-imports.d.ts`, which IS tracked
  // (`.gitignore` covers `components.d.ts` and not this one). Today the output is byte-identical
  // and the tree stays clean after a run; the day it is not, `npx vitest run` dirties the working
  // copy. Named so that a mysteriously modified file after a test run is recognised rather than
  // investigated. Measured: no slowdown (10.1s with, 10.7s without), and no name collisions with
  // the 608 components it registers.
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
      // could reach the real components by neither route.
      // ⚠️ CORRECTED: AN EARLIER VERSION OF THIS COMMENT JUSTIFIED THE ALIAS BY THE WRONG
      // MECHANISM. It said `barrelImports` rewrites `from 'frappe-ui'` to these same files and
      // that this alias is that rewrite. It is not: `barrelImports` is `apply: 'serve'` and
      // `linkedOnly: true`, so it rewrites nothing when `frappe-ui` is an installed dependency,
      // which it is here. §0.2g in this repo's own new comment, found by the adversarial review.
      // The alias is defensible on a different and better ground: `exports["."]` is
      // `./src/index.ts` and `files` publishes `src`, so the package's PUBLISHED ENTRY IS THAT
      // SOURCE TREE — the alias resolves to the exact files the application loads, not to a
      // parallel copy. And it fails loudly if a future version moves them: the whole test file
      // fails to collect, with a non-zero exit, rather than quietly stopping testing.
      'frappe-ui/src': path.resolve(__dirname, 'node_modules/frappe-ui/src'),
    },
  },
})
