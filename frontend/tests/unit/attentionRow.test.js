import { mount } from '@vue/test-utils'
import AttentionRow from '@/components/AttentionRow.vue'

/**
 * ⚠️ THIS FILE EXISTS BECAUSE THE COVERAGE IT REPLACES CAUGHT REAL DEFECTS. `ATTENTION-V2` rev 3
 * §11: retiring the desk page removed the suite section that EXECUTED the renderer, and that
 * section — not the three greps beside it — caught a stored XSS written with string concatenation
 * and an inverted empty-state condition.
 *
 * ⚠️ AND THE VALUES ON THIS SURFACE ARE ATTACKER-INFLUENCED BY CONSTRUCTION. The organisation name,
 * the subject and the snippet all originate in inbound mail from strangers.
 */

const card = (over = {}) => ({
  deal: 'CRM-DEAL-2026-00001',
  who: 'Ooh! Media',
  status: 'Quotation Issued',
  state: 'waiting_on_us',
  age_days: 18,
  band: '5+ days',
  critical: true,
  subject: 'Re: Quotation: QTN-00213',
  snippet: 'I’ve sent through a bank transfer.',
  ...over,
})

/**
 * ⚠️ `card()` DEFAULTS TO A DEAL, so every test that does not override `doctype` tests ONE
 * population — which is `CC_STANDING_RULES §0.2i`, and is exactly how a broken Lead route survived
 * 177 green tests. The block below walks a Lead down this component's paths.
 */
const lead = (over = {}) => card({
  deal: 'CRM-LEAD-2026-00042', doctype: 'CRM Lead', who: 'Aberfeldy Barn',
  status: 'New', critical: false, status_stale: false, ...over,
})

describe('AttentionRow — a Lead travels every path a Deal does', () => {
  it('renders a Lead with its own status and age', () => {
    const t = mount(AttentionRow, { props: { card: lead({ age_days: 14 }) } }).text()
    expect(t).toContain('Aberfeldy Barn')
    expect(t).toContain('New')
    expect(t).toContain('14 days')
  })

  // ⚠️ A LEAD IS NEVER STALE — the band is a fact about CRM Deal Status, and a Lead's status plays
  // no part in anything. The server never sets the flag for a Lead; this makes the row's silence
  // on it a property rather than an accident of the data.
  it('never shows the out-of-date marker on a Lead', () => {
    expect(mount(AttentionRow, { props: { card: lead() } }).text()).not.toContain('stale')
  })

  it('opens and expands like any other row', async () => {
    const w = mount(AttentionRow, { props: { card: lead({ snippet: 'Do you do 200?' }) } })
    await w.find('button').trigger('click')
    expect(w.text()).toContain('Do you do 200?')
    await w.find('[data-testid="attention-row"]').trigger('click')
    expect(w.emitted('open')[0][0].doctype).toBe('CRM Lead')
  })

  it('says who wrote last on a Lead too', () => {
    expect(mount(AttentionRow, { props: { card: lead({ state: 'waiting_on_us' }) } }).text())
      .toContain('contact')
    expect(mount(AttentionRow, { props: { card: lead({ state: 'awaiting_them' }) } }).text())
      .toContain('us')
  })
})

describe('AttentionRow — rendering', () => {
  it('escapes every value that came from inbound mail', async () => {
    const hostile = '<script>alert(1)</script>'
    const w = mount(AttentionRow, {
      props: { card: card({ who: hostile, subject: hostile, snippet: hostile }) },
    })
    await w.find('button').trigger('click')          // open the expander so the snippet renders
    expect(w.find('script').exists()).toBe(false)
    expect(w.html()).not.toContain('<script>')
    // ...and it is not silently dropped either: the customer's real name may contain anything.
    expect(w.text()).toContain(hostile)
  })

  // ⚠️ THE WORDS STILL CARRY THE MEANING — and they now say WHICH clause applies, because a
  // disjunction above the list could not tell the reader why a row at "today" was critical.
  it('says why it is critical in words, not only in colour', () => {
    const w = mount(AttentionRow, { props: { card: card({ critical_because: ['age'] }) } })
    expect(w.text()).toContain('age')
    const both = mount(AttentionRow,
      { props: { card: card({ critical_because: ['age', 'stage'] }) } })
    expect(both.text()).toContain('age + stage')
    expect(mount(AttentionRow, { props: { card: card({ critical: false }) } }).text())
      .not.toContain('stage')
  })

  it('reads the age the server computed and never recomputes one', () => {
    expect(mount(AttentionRow, { props: { card: card({ display_age_days: 18 }) } }).text())
      .toContain('18 days')
    expect(mount(AttentionRow, { props: { card: card({ display_age_days: 1 }) } }).text())
      .toContain('1 day')
    // ⚠️ AN AGE THAT CANNOT BE READ MUST NOT RENDER AS ZERO OR AS BLANK — zero is a claim, and a
    // dash reads as missing data where this is a declared fact.
    expect(mount(AttentionRow,
      { props: { card: card({ age_days: null, display_age_days: null }) } }).text())
      .toContain('never')
  })

  // ⚠️ THE TWO COLUMNS MUST NOT CONTRADICT EACH OTHER. "we wrote last" beside "not heard from" was
  // two true facts arranged to look like a fault. When the contact has never written, the age
  // shown is how long OUR message has been sitting.
  it('shows how long we have been waiting when the contact has never written', () => {
    const t = mount(AttentionRow, {
      props: { card: card({ state: 'awaiting_them', age_days: null, display_age_days: 4,
                            age_basis: 'us' }) },
    }).text()
    expect(t).toContain('4 days')
    expect(t).toContain('us')
    expect(t).not.toContain('never')
  })

  it('keeps the snippet behind the expander, and the expander does not open the deal', async () => {
    const w = mount(AttentionRow, { props: { card: card() } })
    expect(w.text()).not.toContain('bank transfer')
    await w.find('button').trigger('click')
    expect(w.text()).toContain('bank transfer')
    expect(w.emitted('open')).toBeUndefined()
    await w.find('[data-testid="attention-row"]').trigger('click')
    expect(w.emitted('open')).toHaveLength(1)
  })

  // ⚠️ EACH VALUE IS ASSERTED SEPARATELY. Deleting the subject or the status from the row left
  // 142 tests green, because nothing named them.
  it('shows the organisation, the subject, the status and who wrote last', () => {
    const t = mount(AttentionRow, { props: { card: card() } }).text()
    expect(t).toContain('Ooh! Media')
    expect(t).toContain('Re: Quotation: QTN-00213')
    expect(t).toContain('Quotation Issued')
    expect(t).toContain('contact')
    expect(mount(AttentionRow, { props: { card: card({ state: 'awaiting_them' }) } }).text())
      .toContain('us')
  })

  // ⚠️ STATUS IS CONTEXT ON THE ROW. It orders the list and can raise a row to critical; it must
  // be legible either way, so it is not dropped or dimmed out of existence on a critical row.
  it('shows the status on the row whether or not the row is critical', () => {
    expect(mount(AttentionRow, { props: { card: card({ critical: true }) } }).text())
      .toContain('Quotation Issued')
    expect(mount(AttentionRow, { props: { card: card({ critical: false }) } }).text())
      .toContain('Quotation Issued')
  })

  // ⚠️ THE ROW SAYS WHY IT IS AT THE TOP. A band that reorders the list without explaining itself
  // reads as the list being arbitrary. It is a fact about two timestamps, so it is worded as one.
  it('marks a status the customer has written past, and only then', () => {
    expect(mount(AttentionRow, { props: { card: card({ status_stale: true }) } }).text())
      .toContain('stale')
    expect(mount(AttentionRow, { props: { card: card({ status_stale: false }) } }).text())
      .not.toContain('stale')
  })

  // ⚠️ THE CLASS IS THE BEHAVIOUR HERE, so it is asserted directly. Alan: the yellow has too little
  // contrast to read. It cannot be fixed by going darker — `ink-amber-3` IS amber-600, the darkest
  // amber frappe-ui defines, about 3:1 on white against the 4.5:1 small text needs. So amber may
  // only be a BACKGROUND on this surface. Mutation found this uncovered: putting the old ink token
  // back left every test green.
  it('never puts amber ink on text — the colour may only be a background', () => {
    const w = mount(AttentionRow, { props: { card: card({ state: 'waiting_on_us' }) } })
    expect(w.html()).not.toContain('text-ink-amber')
    expect(w.html()).toContain('bg-surface-amber-1')
    expect(w.html()).toContain('text-ink-gray-8')
  })

  // ⚠️ AN UNREADABLE DIRECTION MUST NOT CLAIM THE CUSTOMER WAS ANSWERED. Two branches meant every
  // non-`waiting_on_us` state said "we wrote last", which on an `unknown` row is a false all-clear
  // one row wide.
  it('never says we wrote last when the direction could not be read', () => {
    const t = mount(AttentionRow, { props: { card: card({ state: 'unknown' }) } }).text()
    expect(t).toContain('unknown')
    expect(mount(AttentionRow, { props: { card: card({ state: 'awaiting_them' }) } }).text())
      .toContain('us')
  })

  // ⚠️ THE ROW ANSWERS ONE QUESTION AND MUST NOT BE HANDED A WIDER ONE. Passing the page's whole
  // `degraded` flag made a row claim the MESSAGE could not be read when it was the Leads or the
  // status log that failed — inverting the very error this prop exists to prevent.
  it('only claims a message could not be read when the message read is what failed', async () => {
    const w = mount(AttentionRow, { props: { card: card({ snippet: '' }), degraded: false } })
    await w.find('button').trigger('click')
    expect(w.text()).toContain('No message text was recorded')
    expect(w.text()).not.toContain('could not be read just now')
  })

  it('says so when a message has no text rather than showing an empty box', async () => {
    const w = mount(AttentionRow, { props: { card: card({ snippet: '' }) } })
    await w.find('button').trigger('click')
    expect(w.text()).toContain('No message text was recorded')
  })

  // ⚠️ "NOTHING WAS RECORDED" AND "IT COULD NOT BE READ" ARE DIFFERENT FACTS. On the degraded
  // path every snippet arrives empty, and the first sentence is then simply false.
  it('does not claim a message is missing when it merely could not be read', async () => {
    const w = mount(AttentionRow, { props: { card: card({ snippet: '' }), degraded: true } })
    await w.find('button').trigger('click')
    expect(w.text()).toContain('could not be read just now')
    expect(w.text()).not.toContain('No message text was recorded')
  })
})
