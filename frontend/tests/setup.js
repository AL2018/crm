import { config } from '@vue/test-utils'

// Minimal globals that CRM code expects
globalThis.__ = (msg, args) => {
  if (!args) return msg
  let str = msg
  if (Array.isArray(args)) {
    args.forEach((arg, i) => {
      str = str.replace(`{${i}}`, arg)
    })
  }
  return str
}

globalThis.window = globalThis.window || {}
globalThis.window.sysdefaults = { currency: 'USD' }

// ⚠️ MIRRORS `src/translation.js`, WHICH SETS BOTH. A component template resolves `__` through the
// render context, NOT through `globalThis` — Vue only falls back to a small whitelist of globals —
// so a `.vue` test without this fails on every translated string in the markup while the plain
// `.js` tests beside it pass. Registering both is what the running app does.
config.global.mocks = { ...(config.global.mocks || {}), __: globalThis.__ }
