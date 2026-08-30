import { reactive } from 'vue'
import { mount } from '@vue/test-utils'
import { vi } from 'vitest'

/**
 * ⚠️ THE EMPTY STATE IS THE THING UNDER TEST, AND IT IS NOT COSMETIC. `ATTENTION-V2` rev 3 §11.
 * An earlier version of this surface showed a real Sales User a green "every open deal has been
 * answered" over ten waiting deals and three that were more than five days old, because the count
 * it read was taken AFTER row-level permission scoping. The condition was inverted; three greps
 * did not see it; executing the renderer did.
 *
 * There are THREE ways to be empty and only one of them is good news, so the green branch must be
 * last and must be reachable only when the surface can actually substantiate it.
 */

const board = reactive({ data: null, loading: false, reload: vi.fn() })
const push = vi.fn()

vi.mock('frappe-ui', () => ({
  createResource: () => board,
  Button: { name: 'Button', template: '<button />' },
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/components/LayoutHeader.vue', () => ({
  default: { name: 'LayoutHeader', template: '<div><slot name="left-header" /><slot name="right-header" /></div>' },
}))

const Attention = (await import('@/pages/Attention.vue')).default

const card = (over = {}) => ({
  deal: 'CRM-DEAL-2026-00001', who: 'Ooh! Media', status: 'Quotation Issued',
  state: 'waiting_on_us', age_days: 18, band: '5+ days', critical: true,
  subject: 'Re: QTN-00213', snippet: 'Any update?', ...over,
})
const payload = (over = {}) => ({
  cards: [], bands: ['0-1 day', '2-4 days', '5+ days'],
  columns: { '0-1 day': [], '2-4 days': [], '5+ days': [] }, unbanded: [],
  total: 0, critical: 0, open_total: 12, unlinked: 0, unassessable: 0,
  stats: { since: '2026-08-24', days: 7, performed: 4, to_go: 0, to_clear: 4 }, ...over,
})

const render = async (data) => {
  board.data = data
  const w = mount(Attention)
  await w.vm.$nextTick()
  return w
}

describe('Attention — the empty state cannot claim an all-clear it cannot substantiate', () => {
  it('says so plainly when nothing is visible to this user', async () => {
    const w = await render(payload({ open_total: 0 }))
    expect(w.text()).toContain('that is not the same as an all-clear')
    expect(w.text()).not.toContain('have been answered')
  })

  it('says so when deals exist but cannot be read', async () => {
    const w = await render(payload({ unlinked: 3 }))
    expect(w.text()).toContain('cannot yet tell you why')
    expect(w.text()).toContain('That is not an all-clear')
    expect(w.text()).not.toContain('have been answered')
  })

  it('claims the all-clear ONLY when every open deal was seen and answered', async () => {
    const w = await render(payload())
    expect(w.text()).toContain('All 12 open deals have been answered')
  })

  it('MUTATION — an all-clear is impossible while anything is waiting', async () => {
    const w = await render(payload({ total: 1, cards: [card()] }))
    expect(w.text()).not.toContain('have been answered')
    expect(w.text()).toContain('Ooh! Media')
  })
})

describe('Attention — the round trip', () => {
  it('opens the deal in the CRM, so back returns to a list that is still there', async () => {
    const w = await render(payload({ total: 1, cards: [card()] }))
    await w.find('[data-testid="attention-row"]').trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'Deal', params: { dealId: 'CRM-DEAL-2026-00001' } })
  })

  it('re-reads on arrival, so returning shows the current truth and not a stale page', async () => {
    board.reload.mockClear()
    await render(payload())
    expect(board.reload).toHaveBeenCalled()
  })

  it('shows the period the "performed" count covers, so the number can be checked', async () => {
    const w = await render(payload())
    expect(w.text()).toContain('last 7 days')
  })

  // ⚠️ A ROW WITH NO READABLE AGE HAS NO BAND. It used to be counted in `total` and rendered
  // nowhere, because the page flattened `columns` itself — on the size of the task and off the
  // list. The page reads the server's `cards` now, and this is what pins it.
  it('renders a waiting row whose age could not be read', async () => {
    const w = await render(payload({ total: 1, cards: [card({ age_days: null, band: null, critical: false })] }))
    expect(w.text()).toContain('Ooh! Media')
  })
})
