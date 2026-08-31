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

const board = reactive({ data: null, loading: false, error: null, reload: vi.fn() })
const push = vi.fn()

// ⚠️ `FormControl` IS STUBBED AS A REAL INPUT, NOT AS AN INERT PLACEHOLDER. The filter tests
// exercise typing and selecting, so a stub that swallows `v-model` would turn every one of them
// green while testing nothing — the shape of coverage this suite exists to avoid. It renders the
// same element the real control renders and emits the same event, and nothing more.
vi.mock('frappe-ui', () => ({
  createResource: () => board,
  Button: { name: 'Button', template: '<button><slot />{{ label }}</button>', props: ['label'] },
  FormControl: {
    name: 'FormControl',
    props: ['type', 'modelValue', 'options', 'placeholder'],
    emits: ['update:modelValue'],
    template: `
      <select v-if="type === 'select'" :value="modelValue"
              @change="$emit('update:modelValue', options[$event.target.selectedIndex].value)">
        <option v-for="o in options" :key="String(o.value)" :value="o.value">{{ o.label }}</option>
      </select>
      <input v-else type="search" :value="modelValue" :placeholder="placeholder"
             @input="$emit('update:modelValue', $event.target.value)" />`,
  },
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
  age_source: 'their_last_message',
  degraded: [],
  stats: { since: '2026-08-24', days: 7, performed: 4, performed_covers: ['CRM Deal'],
           to_go: 0, to_clear: 4 }, ...over,
})
const rows = (w) => w.findAll('[data-testid="attention-row"]')

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
    expect(w.text()).toContain('All 12 open deals and leads have been answered')
  })

  // ⚠️ COUNT THE ROWS. The XSS check set three fields to the same string, so it passed on `who`
  // alone; nothing asserted how MANY rows rendered, and dropping the `!c.critical` filter — every
  // critical deal rendered twice — went unnoticed by 142 green tests.
  it('renders each deal exactly once, in the group its flag puts it in', async () => {
    const w = await render(payload({
      total: 2, critical: 1,
      cards: [card(), card({ deal: 'CRM-DEAL-2026-00002', critical: false, who: 'Quarry' })],
    }))
    expect(rows(w)).toHaveLength(2)
    expect(w.text().match(/Ooh! Media/g)).toHaveLength(1)
    expect(w.text().match(/Quarry/g)).toHaveLength(1)
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

  // ⚠️ A LEAD GOES TO THE LEAD ROUTE. Every row went to the DEAL route, so clicking a Lead landed
  // on `/crm/deals/CRM-LEAD-…`, which is nowhere — and the round trip is the acceptance test for
  // this whole surface. 171 green tests missed it because the only click test used a Deal.
  it('opens a Lead on the Lead route, not the Deal route', async () => {
    push.mockClear()
    const w = await render(payload({
      total: 1, cards: [card({ deal: 'CRM-LEAD-2026-00042', doctype: 'CRM Lead' })],
    }))
    await w.find('[data-testid="attention-row"]').trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'Lead', params: { leadId: 'CRM-LEAD-2026-00042' } })
  })

  // ⚠️ A DEGRADED READ CANNOT REACH THE GREEN BOX. A failed Lead read deleted the whole Lead half
  // of the list; with the Deals all answered the surface then painted the all-clear over it.
  it('never claims the all-clear when part of the list could not be read', async () => {
    const w = await render(payload({ degraded: ['leads'] }))
    expect(w.text()).not.toContain('have been answered')
    expect(w.text()).toContain('part of this list could not be read')
    expect(w.text()).toContain('any enquiry waiting for a reply is missing')
  })

  // ⚠️ THE PAGE MUST NOT TELL THE ROW THE WRONG THING. `degraded: ['leads']` means the Leads read
  // failed, NOT that this row's message could not be read.
  it('does not blame the message read when a different read failed', async () => {
    const w = await render(payload({
      total: 1, degraded: ['leads'],
      cards: [card({ snippet: '' })],
    }))
    await w.findAll('button').find((b) => b.attributes('aria-expanded')).trigger('click')
    expect(w.text()).toContain('No message text was recorded')
    expect(w.text()).not.toContain('could not be read just now')
  })

  // ⚠️ THE DEGRADED AND EMPTY STATES WITH A LEAD PRESENT — §0.2i names these as paths the second
  // population must travel, and they were the two it did not.
  it('keeps Leads on the list while a different read is degraded', async () => {
    const w = await render(payload({
      total: 2, degraded: ['status'],
      cards: [card({ deal: 'D1', who: 'D1' }),
              card({ deal: 'L1', who: 'L1', doctype: 'CRM Lead', critical: false })],
    }))
    expect(rows(w)).toHaveLength(2)
    expect(w.text()).toContain('the order is not the usual one')
  })

  it('never claims the all-clear when the Lead read is the one that failed', async () => {
    const w = await render(payload({ degraded: ['leads'], total: 0 }))
    expect(w.text()).not.toContain('have been answered')
    expect(w.text()).toContain('any enquiry waiting for a reply is missing')
  })

  it('names which read failed, so the gap is specific rather than a shrug', async () => {
    expect((await render(payload({ degraded: ['status'] }))).text())
      .toContain('the order is not the usual one')
  })

  // ⚠️ AN ERROR MUST NOT RENDER AS A BLANK PAGE — an empty surface reads as an all-clear with even
  // less to substantiate it than the green box.
  it('says so when the list could not be loaded at all', async () => {
    board.error = { messages: ['Not permitted'] }
    try {
      const w = await render(null)
      expect(w.text()).toContain('could not be loaded')
      expect(w.text()).toContain('not the same as nothing waiting')
    } finally {
      board.error = null
    }
  })

  it('qualifies "Performed" while it only covers deals', async () => {
    expect((await render(payload())).text()).toContain('deals only')
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

  // ⚠️ A COUNT AND ITS HEADING MUST DESCRIBE THE SAME PERIOD. `days` was a constant, so a custom
  // `since` produced an all-time number labelled "last 7 days".
  it('names the date instead when the period is not a number of days', async () => {
    const w = await render(payload({ stats: { since: '2020-01-01', days: null, performed: 4, to_go: 0, to_clear: 4 } }))
    expect(w.text()).toContain('since 2020-01-01')
    expect(w.text()).not.toContain('last 7 days')
  })

  // ⚠️ SILENCE WAS THE DEFECT. One caught exception server-side takes every age away; the rows
  // still render, the Critical group empties, and nothing said why.
  it('says so when the ages are the less-truthful kind', async () => {
    // The real server sets both together — `degraded` names what failed, `age_source` says which
    // kind of age survived — so the fixture carries both rather than half a payload.
    expect((await render(payload({ age_source: 'newest_correspondence', degraded: ['ages'] }))).text())
      .toContain('ages are measured from the last message either way')
    expect((await render(payload())).text())
      .not.toContain('ages are measured from the last message either way')
  })

  // ⚠️ THE SERVER'S ORDER IS THE ORDER. Alan's final ruling of 31 August puts Deals in CRM Deal
  // Status position order with days secondary — a rule that changed three times in one day, which
  // is exactly why the page must not carry a second copy of it.
  it('renders the server order exactly, and never re-sorts', async () => {
    const p = payload({
      total: 3,
      cards: [
        card({ deal: 'A', who: 'A', subject: '', status: 'Ready to Close', age_days: 1, critical: true }),
        card({ deal: 'B', who: 'B', subject: '', status: 'Quotation Issued', age_days: 16, critical: true }),
        card({ deal: 'C', who: 'C', subject: '', status: 'New Enquiry', age_days: 18, critical: true }),
      ],
    })
    const w = await render(p)
    expect(rows(w).map((r) => r.text().replace(/[^ABC]/g, '')[0])).toEqual(['A', 'B', 'C'])
  })

  // ⚠️ THE VERSION ABOVE WAS VACUOUS FOR THE DEFECT IT LOOKED LIKE IT COVERED: every card in it is
  // critical, so grouping critical-first would have produced the same order and passed. THIS one
  // interleaves them. Splitting the list into "Critical" and "Everything else" pulled every
  // critical row to the top and silently overrode the ordering ruling — a stale Negotiation the
  // server placed fourth rendered eighth.
  it('MUTATION — a non-critical row keeps its place among critical ones', async () => {
    const p = payload({
      total: 4, critical: 2,
      cards: [
        card({ deal: 'A', who: 'A', subject: '', critical: true }),
        card({ deal: 'B', who: 'B', subject: '', critical: false }),
        card({ deal: 'C', who: 'C', subject: '', critical: true }),
        card({ deal: 'D', who: 'D', subject: '', critical: false }),
      ],
    })
    const w = await render(p)
    expect(rows(w).map((r) => r.text().replace(/[^ABCD]/g, '')[0])).toEqual(['A', 'B', 'C', 'D'])
  })

  // ⚠️ THE FALLBACK MUST NOT REORDER THE LIST. `bands` is youngest-first, so flattening them put
  // a one-day row above a three-day row — the surface's one ordering rule inverted on exactly the
  // path nobody would be watching.
  it('keeps oldest-first when it falls back to the bands', async () => {
    const c = (d, days) => card({ deal: d, who: d, critical: false, age_days: days })
    const p = payload({
      total: 3,
      columns: { '0-1 day': [c('A', 1)], '2-4 days': [c('B', 3), c('C', 2)], '5+ days': [] },
    })
    delete p.cards
    const w = await render(p)
    expect(rows(w).map((r) => r.text().replace(/[^ABC]/g, '')[0])).toEqual(['B', 'C', 'A'])
  })

  // ⚠️ AN OLDER SERVER SENDS NO `age_source` AT ALL, and that is exactly the case where the ages
  // ARE the older kind. Testing equality with the failure string left the banner silent there.
  it('warns about the ages when the server is too old to say which kind they are', async () => {
    // An older server sends NEITHER key. Deleting only one leaves a payload no server produces.
    const p = payload()
    delete p.age_source
    delete p.degraded
    expect((await render(p)).text()).toContain('ages are measured from the last message either way')
  })

  it('says what "Performed" counts, because the word alone reads as work done', async () => {
    expect((await render(payload())).text()).toContain('answered and off the list')
  })

  // ⚠️ TWO SEPARATELY DEPLOYED APPS. If the CRM ships ahead of `lc_winnow`, `cards` is absent
  // while `total` is not — the page rendered a count above nothing at all.
  it('still renders when the server is a version behind and sends no `cards`', async () => {
    const c = card()
    const p = payload({ total: 1, columns: { '0-1 day': [], '2-4 days': [], '5+ days': [c] } })
    delete p.cards
    expect(rows(await render(p))).toHaveLength(1)
  })

  // ⚠️ A ROW WITH NO READABLE AGE HAS NO BAND. It used to be counted in `total` and rendered
  // nowhere, because the page flattened `columns` itself — on the size of the task and off the
  // list. The page reads the server's `cards` now, and this is what pins it.
  it('renders a waiting row whose age could not be read', async () => {
    const w = await render(payload({ total: 1, cards: [card({ age_days: null, band: null, critical: false })] }))
    expect(w.text()).toContain('Ooh! Media')
  })
})

/**
 * §5 — search and filter. "At 50 items scrolling is not navigation."
 *
 * ⚠️ THE COUNTS ARE THE RISK HERE, NOT THE FILTERING. A count that silently describes a different
 * set than the list below it is the shape of defect this estate keeps producing, and a filter is
 * the easiest way to produce it.
 */
describe('Attention — search and filter', () => {
  const many = () => payload({
    total: 3, critical: 1,
    cards: [
      card({ deal: 'D1', who: 'Ooh! Media', subject: 'Re: QTN-00213', age_days: 18, critical: true }),
      card({ deal: 'D2', who: 'Quarry', subject: 'Corporate enquiry', age_days: 3, critical: false }),
      card({ deal: 'D3', who: 'Astrid Mullins', subject: 'Wedding favours', age_days: 1, critical: false }),
    ],
    stats: { since: '2026-08-24', days: 7, performed: 4, to_go: 3, to_clear: 7 },
  })
  const type = async (w, text) => {
    await w.find('input[type="search"]').setValue(text)
    return w
  }
  // ⚠️ ADDRESSED BY WHICH SELECT, NOT BY GLOBAL OPTION INDEX. There are three selects now — type,
  // days and sort — so a flat `findAll('option')[i]` silently started pointing at a different
  // control the moment one was added, which is a test that moves when the page does.
  const SELECT = { type: 0, days: 1, sort: 2 }
  const choose = async (w, which, i) => {
    await w.findAll('select')[SELECT[which]].findAll('option')[i].setSelected()
    return w
  }
  const age = (w, i) => choose(w, 'days', i)

  it('searches the organisation or person', async () => {
    const w = await type(await render(many()), 'quarry')
    expect(rows(w)).toHaveLength(1)
    expect(w.text()).toContain('Quarry')
  })

  it('searches the subject as well, because two deals share an organisation', async () => {
    const w = await type(await render(many()), 'wedding')
    expect(rows(w)).toHaveLength(1)
    expect(w.text()).toContain('Astrid Mullins')
  })

  it('filters by age, and composes with the search', async () => {
    const w = await render(many())
    await age(w, 2)
    expect(rows(w)).toHaveLength(1)
    await type(w, 'quarry')
    expect(rows(w)).toHaveLength(0)
  })

  // ⚠️ AN UNKNOWN AGE IS NOT A YOUNG ONE. Reading `null` as zero would drop a waiting row out of
  // the list through an age filter — the same class of defect as the unbanded rows vanishing.
  it('never drops a row whose age could not be read', async () => {
    const p = many()
    p.cards.push(card({ deal: 'D4', who: 'Unknown Age', age_days: null, critical: false }))
    p.total = 4
    const w = await render(p)
    await age(w, 2)
    expect(w.text()).toContain('Unknown Age')
  })

  // ⚠️ THE COUNTS MUST DESCRIBE THE LIST UNDERNEATH THEM, and say which of them cannot.
  // The VALUE is asserted, not just the "of N" beside it — the first version of this test read
  // only the "of 3" suffix, so leaving the count itself unfiltered passed it. A count test that
  // does not read the count is decoration.
  it('reports the filtered counts against the whole, and says a filter is on', async () => {
    const w = await type(await render(many()), 'quarry')
    expect(w.find('[data-testid="count-to-go"]').text()).toBe('1')
    expect(w.text()).toContain('of 3')
    expect(w.text()).toContain('A filter is on')
    expect(w.text()).toContain('still cover the whole list')
  })

  it('filters the critical count too, since it also describes the list', async () => {
    const w = await type(await render(many()), 'quarry')
    expect(w.find('[data-testid="count-critical"]').text()).toBe('0')
    expect(rows(w)).toHaveLength(1)
  })

  it('shows the unfiltered counts and no notice when nothing is filtered', async () => {
    const w = await render(many())
    expect(w.find('[data-testid="count-to-go"]').text()).toBe('3')
    expect(w.text()).not.toContain('A filter is on')
    expect(w.text()).not.toContain('of 3')
  })

  // ⚠️ A FILTER THAT MATCHES NOTHING IS NOT AN ALL-CLEAR. Without its own branch the list renders
  // empty under a "To go 0 of 3" heading — the same false reassurance the three empty states exist
  // to prevent, arriving by a door they do not cover.
  it('says a filter matched nothing, and never claims the work is done', async () => {
    const w = await type(await render(many()), 'zzzz')
    expect(rows(w)).toHaveLength(0)
    expect(w.text()).toContain('Nothing matches this filter')
    expect(w.text()).toContain('3 records are still waiting')
    expect(w.text()).not.toContain('have been answered')
  })

  it('clears back to the whole list', async () => {
    // The clear control is the native Button now, not a bare underlined link — found by its
    // label so the test does not depend on which classes the component happens to apply.
    const w = await type(await render(many()), 'quarry')
    expect(rows(w)).toHaveLength(1)
    const clear = w.findAll('button').find((b) => b.text().includes('Clear'))
    await clear.trigger('click')
    expect(rows(w)).toHaveLength(3)
  })
})

/**
 * rev 4 §1 — Leads and Deals in ONE list, type as a filter.
 * rev 4 §3 — a sort control on days, both ways, in the native form.
 */
describe('Attention — Leads, type and sort', () => {
  const both = () => payload({
    total: 4, critical: 0,
    cards: [
      card({ deal: 'D1', who: 'D1', subject: '', doctype: 'CRM Deal', age_days: 20, critical: false }),
      card({ deal: 'L1', who: 'L1', subject: '', doctype: 'CRM Lead', age_days: 13, critical: false }),
      card({ deal: 'L2', who: 'L2', subject: '', doctype: 'CRM Lead', age_days: 2, critical: false }),
      card({ deal: 'D2', who: 'D2', subject: '', doctype: 'CRM Deal', age_days: 30, critical: false }),
    ],
    stats: { since: '2026-08-25', days: 7, performed: 1, to_go: 4, to_clear: 5 },
  })
  const SELECT = { type: 0, days: 1, sort: 2 }
  const pick = async (w, which, i) => {
    await w.findAll('select')[SELECT[which]].findAll('option')[i].setSelected()
    return w
  }
  // Match the identifier rather than stripping characters: a strip-list silently drops any
  // digit it was not told about, which is how `L9` read as `L`.
  const ids = (w) => rows(w).map((r) => (r.text().match(/[DL]\d/) || [''])[0])

  it('shows Leads and Deals together by default', async () => {
    expect(ids(await render(both()))).toEqual(['D1', 'L1', 'L2', 'D2'])
  })

  it('narrows to Deals only, and to Leads only', async () => {
    const w = await render(both())
    await pick(w, 'type', 1)
    expect(ids(w)).toEqual(['D1', 'D2'])
    await pick(w, 'type', 2)
    expect(ids(w)).toEqual(['L1', 'L2'])
  })

  it('counts the filtered type against the whole, and says a filter is on', async () => {
    const w = await render(both())
    await pick(w, 'type', 2)
    expect(w.find('[data-testid="count-to-go"]').text()).toBe('2')
    expect(w.text()).toContain('of 4')
    expect(w.text()).toContain('A filter is on')
  })

  // ⚠️ THE DEFAULT IS THE SERVER'S ORDER, and the option that does nothing SAYS it does nothing —
  // otherwise the list can sit in an order the rules do not describe with nothing to explain it.
  it('leaves the server order alone until a sort is chosen, then sorts by days both ways', async () => {
    const w = await render(both())
    expect(ids(w)).toEqual(['D1', 'L1', 'L2', 'D2'])
    await pick(w, 'sort', 1)
    expect(ids(w)).toEqual(['D2', 'D1', 'L1', 'L2'])
    await pick(w, 'sort', 2)
    expect(ids(w)).toEqual(['L2', 'L1', 'D1', 'D2'])
    await pick(w, 'sort', 0)
    expect(ids(w)).toEqual(['D1', 'L1', 'L2', 'D2'])
  })

  // ⚠️ AN UNKNOWN AGE SORTS LAST WHICHEVER WAY THE SORT RUNS. An unknown is not an old thing, and
  // it is not a new one either — reading it as 0 would put it first on an ascending sort, which is
  // the same class of defect as the age filter dropping it.
  it('keeps a row with no readable age last, in both directions', async () => {
    const p = both()
    p.cards.push(card({ deal: 'L9', who: 'L9', subject: '', doctype: 'CRM Lead', age_days: null, critical: false }))
    p.total = 5
    const w = await render(p)
    await pick(w, 'sort', 1)
    expect(ids(w).at(-1)).toBe('L9')
    await pick(w, 'sort', 2)
    expect(ids(w).at(-1)).toBe('L9')
  })

  // ⚠️ SORT IS NOT A FILTER. Sorting changes the order of what is shown; filtering changes what is
  // shown. Only the second can make a count describe a different set than the list.
  it('choosing a sort does not claim a filter is on', async () => {
    const w = await render(both())
    await pick(w, 'sort', 1)
    expect(w.text()).not.toContain('A filter is on')
    expect(w.find('[data-testid="count-to-go"]').text()).toBe('4')
  })
})
