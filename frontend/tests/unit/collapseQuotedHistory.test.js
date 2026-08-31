import { describe, it, expect } from 'vitest'
import { collapseQuotedHistory } from '@/utils/collapseQuotedHistory'

// The shape the CRM's own composer produces — `EmailArea.vue:129` emits `<blockquote>${message}
// </blockquote>` with no class and no `On … wrote:` header. 35 of 35 Sent production rows carrying
// a quote match `<p></p><blockquote` exactly.
const sent = (body = 'Yes, Tuesday works.', quote = 'the original enquiry') =>
  `<p>${body}</p><p>Kind regards, Alicia</p><p></p><blockquote><p>${quote}</p></blockquote>`

const parse = (html) => new DOMParser().parseFromString(html, 'text/html')

describe('collapseQuotedHistory', () => {
  it('collapses a bare blockquote — the shape three existing selectors all miss', () => {
    const out = collapseQuotedHistory(sent())
    expect(out).not.toBeNull()
    const d = parse(out)
    expect(d.querySelectorAll('.replied-content')).toHaveLength(1)
    expect(d.querySelector('label.collapse').textContent).toBe('...')
    expect(d.querySelector('input.replyCollapser')).not.toBeNull()
  })

  // ⚠️ THE STYLESHEET HIDES `.collapse + input + div`. Appending the blockquote straight into the
  // wrapper renders a toggle that does nothing — visible, plausible and inert. This asserts the
  // sibling chain the CSS actually names, not merely that a wrapper exists.
  it('puts the quote inside a div immediately after the input, which is what the CSS hides', () => {
    const d = parse(collapseQuotedHistory(sent()))
    const kids = [...d.querySelector('.replied-content').children]
    expect(kids.map((el) => el.tagName.toLowerCase())).toEqual(['label', 'input', 'div'])
    expect(kids[2].querySelector('blockquote')).not.toBeNull()
  })

  it('keeps the reply and the signature outside the collapsed part', () => {
    const d = parse(collapseQuotedHistory(sent()))
    d.querySelector('.replied-content').remove()
    const visible = d.body.textContent
    expect(visible).toContain('Yes, Tuesday works.')
    expect(visible).toContain('Kind regards, Alicia')
    expect(visible).not.toContain('the original enquiry')
  })

  // ⚠️ EACH REPLY WRAPS THE LAST — production Sent mail nests to depth 11. Collapsing every one
  // would nest eleven toggles for one thread; collapsing an inner one puts a toggle inside content
  // that is already hidden.
  it('collapses the outermost quote only, however deep the nesting runs', () => {
    const nested = '<p>now</p><blockquote><p>then</p><blockquote><p>before</p></blockquote></blockquote>'
    const d = parse(collapseQuotedHistory(nested))
    expect(d.querySelectorAll('.replied-content')).toHaveLength(1)
    expect(d.querySelectorAll('.replied-content blockquote')).toHaveLength(2)
  })

  it('collapses two separate top-level quotes independently', () => {
    const two = '<p>a</p><blockquote><p>q1</p></blockquote><p>b</p><blockquote><p>q2</p></blockquote>'
    expect(parse(collapseQuotedHistory(two)).querySelectorAll('.replied-content')).toHaveLength(2)
  })

  // ⚠️ `null` IS "LEAVE IT ALONE", NOT "IT IS EMPTY". The caller assigns only when the answer is
  // not null, so a wrong sentinel here blanks the message body.
  it('answers null when there is no quote, so the caller leaves the content untouched', () => {
    expect(collapseQuotedHistory('<p>no quote here</p>')).toBeNull()
    expect(collapseQuotedHistory('')).toBeNull()
    expect(collapseQuotedHistory(null)).toBeNull()
  })

  // ⚠️ A MESSAGE THAT IS ENTIRELY QUOTE WOULD RENDER AS A BARE `…`, indistinguishable from a
  // failed read. Measured at zero on production (0 of 1773 Sent rows begin with `<blockquote`) —
  // the guard exists because measured-zero-today is not cannot-happen, and the failure is silent.
  it('leaves a body that is entirely quoted alone rather than collapsing it to nothing', () => {
    expect(collapseQuotedHistory('<blockquote><p>all of it</p></blockquote>')).toBeNull()
  })

  // ⚠️ TERMINATION. `parseReplyToContent` recurses until its selector matches nothing, which works
  // only because each branch makes the element stop matching. A tag name cannot be un-matched, so
  // that shape would recurse forever on its own output. This is the check that a rewrite back to
  // recursion cannot pass.
  it('terminates, and does not reprocess what it just produced', () => {
    const once = collapseQuotedHistory(sent())
    const twice = collapseQuotedHistory(once)
    expect(parse(twice ?? once).querySelectorAll('.replied-content')).toHaveLength(1)
  })
})
