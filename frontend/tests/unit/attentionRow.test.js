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

  it('says "critical" in words, not only in colour', () => {
    const w = mount(AttentionRow, { props: { card: card() } })
    expect(w.text()).toContain('critical')
    expect(mount(AttentionRow, { props: { card: card({ critical: false }) } }).text())
      .not.toContain('critical')
  })

  it('reads the age the server computed and never recomputes one', () => {
    expect(mount(AttentionRow, { props: { card: card() } }).text()).toContain('18 days')
    expect(mount(AttentionRow, { props: { card: card({ age_days: 1 }) } }).text()).toContain('1 day')
    // ⚠️ AN AGE THAT CANNOT BE READ MUST NOT RENDER AS ZERO OR AS BLANK — zero is a claim.
    expect(mount(AttentionRow, { props: { card: card({ age_days: null }) } }).text())
      .toContain('not heard from')
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
    expect(t).toContain('they wrote last')
    expect(mount(AttentionRow, { props: { card: card({ state: 'awaiting_them' }) } }).text())
      .toContain('we wrote last')
  })

  it('says so when a message has no text rather than showing an empty box', async () => {
    const w = mount(AttentionRow, { props: { card: card({ snippet: '' }) } })
    await w.find('button').trigger('click')
    expect(w.text()).toContain('No message text was recorded')
  })
})
