import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
// ⚠️ THE DECLARING MODULES, NOT THE BARREL. `import { Select } from 'frappe-ui'` is what the page
// writes, and in the app it is rewritten to exactly these paths by frappe-ui's `barrelImports`
// vite plugin. Under the test runner the raw barrel drags in `src/resources/plugin.js`, which
// imports an extensionless path the runner cannot resolve — so these point at the same files the
// application ends up loading, without the plugin in between.
import FormControl from 'frappe-ui/src/components/FormControl/FormControl.vue'
import Select from 'frappe-ui/src/components/Select/Select.vue'

// ⚠️ THIS FILE DELIBERATELY DOES NOT MOCK `frappe-ui`, AND THAT IS THE WHOLE POINT OF IT.
// `7427eb7e` set out to stop the "Needs attention" filter row overflowing the window. It shortened
// the option labels on the reasoning that "a select is as wide as its widest option", and asserted
// the result against a STUBBED `<select>`. Both halves were wrong in the same way: there is no
// `<select>` on the page. `FormControl` dispatches to frappe-ui's `Select`, which renders a
// `<button role="combobox">` with its options in a body portal — and `FormControl` hard-codes
// `w-full` for every select-like type, so three of them at `width:100%` overflowed the row at every
// window width while every test stayed green.
//
// A stub can only confirm what the stub does. These mount the real components.
//
// Running them at all needed `lucideIcons()` in `vitest.config.js`: without it any real frappe-ui
// input fails at transform on `~icons/lucide/chevron-down`, which is why this class of defect had
// been structurally untestable in this repo rather than merely untested.

const OPTIONS = [
  { label: 'All', value: '' },
  { label: 'Deals', value: 'CRM Deal' },
  { label: 'Leads', value: 'CRM Lead' },
]

const trigger = (w) => w.find('[role="combobox"]')

describe('the filter row controls, as the library actually renders them', () => {
  it('a bare Select applies no width of its own, so ours is the width', () => {
    const w = mount(Select, {
      props: { modelValue: '', options: OPTIONS },
      attrs: { class: 'w-auto shrink-0', 'aria-label': 'Type' },
    })
    const cls = trigger(w).attributes('class') || ''
    expect(cls).toContain('w-auto')
    expect(cls).toContain('shrink-0')
    expect(cls).not.toContain('w-full')
  })

  // ⚠️ THE REGRESSION PIN, AND IT ASSERTS THE THING THAT WAS SHIPPED. If someone puts
  // `FormControl type="select"` back — the obvious, tidy-looking change, since every other control
  // in this codebase is a FormControl — this goes red and says why. It also fails if the library
  // ever stops forcing `w-full`, which is the day the swap can be reverted on purpose.
  it('FormControl type="select" forces w-full, which is why the page does not use it here', () => {
    const w = mount(FormControl, {
      props: { type: 'select', modelValue: '', options: OPTIONS },
      attrs: { class: 'w-auto shrink-0', 'aria-label': 'Type' },
    })
    expect(trigger(w).attributes('class') || '').toContain('w-full')
  })

  // ⚠️ THE ACCESSIBLE NAME SURVIVES THE SWAP. The visible label is one word now, so the aria-label
  // is the only thing naming the control — and it has to reach the element a screen reader lands
  // on, not the wrapper.
  it('the aria-label reaches the control a screen reader focuses', () => {
    const w = mount(Select, {
      props: { modelValue: '', options: OPTIONS },
      attrs: { class: 'w-auto shrink-0', 'aria-label': 'Waiting at least' },
    })
    expect(trigger(w).attributes('aria-label')).toBe('Waiting at least')
  })
})
