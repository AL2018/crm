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

  // ⚠️ THIS TEST USED TO ASSERT THE DEFECT AS INTENDED BEHAVIOUR — two quotes, two toggles. The
  // adversarial review measured what that does to real mail: 4 of 47 newly-collapsed production
  // messages emitted two or more pills, three of them the Apple Mail shape below, where the
  // attribution line is its OWN top-level blockquote and the first pill opens to nothing but
  // "On … wrote:". One collapse, at the boundary, is the whole point.
  it('collapses only the last quote, so Apple Mail does not produce two stacked toggles', () => {
    const appleMail =
      '<div>Yes, Tuesday works.<br>' +
      '<blockquote type="cite">On 31 Aug 2026, at 1:28 pm, Alicia wrote:<br></blockquote>' +
      '</div><blockquote type="cite"><div>the original enquiry</div></blockquote>'
    const d = parse(collapseQuotedHistory(appleMail))
    expect(d.querySelectorAll('.replied-content')).toHaveLength(1)
    expect(d.querySelector('.replied-content').textContent).toContain('the original enquiry')
  })

  // ⚠️ A QUOTE WITH THE AUTHOR'S OWN WORDS AFTER IT IS A PULL QUOTE, NOT A BOUNDARY. StarterKit's
  // blockquote is enabled in the composer, so a person can type one and it is byte-identical to a
  // machine boundary. Collapsing it hides the thing being replied to and inverts the meaning.
  it('leaves a pull quote alone, because the reply comes after it', () => {
    // at the top of the message, with the reply below it
    expect(collapseQuotedHistory('<blockquote><p>we need X</p></blockquote><p>Yes, agreed.</p>'))
      .toBeNull()
    // ⚠️ AND MID-MESSAGE, WHICH IS THE CASE THE `before` GUARD CANNOT SEE. Quoting a paragraph and
    // answering underneath is the ordinary shape of a typed quotation, and only the "nothing may
    // follow it" half rejects it. Without that half this collapses and the answer disappears.
    expect(collapseQuotedHistory('<p>You asked:</p><blockquote><p>we need X</p></blockquote><p>Yes.</p>'))
      .toBeNull()
  })

  // ⚠️ A TOGGLE THAT OPENS TO NOTHING IS THE FAILURE THIS BUILD CLAIMED TO GUARD AGAINST WHILE
  // SHIPPING IT — production row `8hc79tec7j` carries a literal empty blockquote inside an Outlook
  // signature table.
  it('ignores an empty quote rather than hanging a toggle on it', () => {
    expect(collapseQuotedHistory('<p>hi</p><blockquote></blockquote>')).toBeNull()
    expect(collapseQuotedHistory('<p>hi</p><blockquote>   </blockquote>')).toBeNull()
  })

  // ⚠️ THE EMPTY QUOTE MUST BE SKIPPED, NOT THE MESSAGE. Production row `8hc79tec7j` — cited as the
  // reason the emptiness guard exists — carries 3642 characters of real quoted history in its first
  // blockquote and a literal empty one in its Outlook signature table. Taking the document-order
  // last quote and refusing on emptiness abandoned the whole message and rendered the history
  // fully expanded: the guard threw away the thing it was protecting.
  it('skips an empty trailing quote and collapses the real one', () => {
    const out = collapseQuotedHistory(
      '<p>reply</p><blockquote><p>REAL HISTORY</p></blockquote><blockquote></blockquote>')
    expect(out).not.toBeNull()
    const d = parse(out)
    expect(d.querySelectorAll('.replied-content')).toHaveLength(1)
    expect(d.querySelector('.replied-content').textContent).toContain('REAL HISTORY')
  })

  // ⚠️ ONE WRAPPING <div> DEFEATED BOTH GUARDS, IN OPPOSITE DIRECTIONS. The walk read only
  // `doc.body.childNodes` and stepped past the entire node containing the quote, so anything inside
  // that node was invisible. Real production rows got opposite answers for the same shape depending
  // on their sender's mail client nesting.
  it('sees the reply when it is inside a wrapper, and still collapses', () => {
    const out = collapseQuotedHistory(
      '<div><p>Yes, Tuesday works.</p><blockquote><p>the original</p></blockquote></div>')
    expect(out).not.toBeNull()
    expect(parse(out).querySelectorAll('.replied-content')).toHaveLength(1)
  })

  // ⚠️ AN ANCESTOR OF THE QUOTE IS NOT CONTENT BESIDE IT. A `<table>` wrapping the quote matches
  // the visible-element list, so counting it would credit the quote's own container as content
  // "before" the quote — and a message that is nothing but a quoted history in a table would
  // collapse to a bare `…`, which is the failure the something-before guard exists to prevent.
  it('does not count the quote\'s own container as content beside it', () => {
    expect(collapseQuotedHistory(
      '<table><tr><td><blockquote><p>all of it</p></blockquote></td></tr></table>')).toBeNull()
  })

  it('sees a pull quote inside a wrapper, and refuses it', () => {
    expect(collapseQuotedHistory(
      '<p>Hi</p><div><blockquote><p>THEIR WORDS</p></blockquote><p>I disagree</p></div>'))
      .toBeNull()
  })

  // ⚠️ `meaningful` READ `img, table, video`, WHICH IS HALF A RULE. An `<svg>` after the quote did
  // not block a collapse, so the collapse hid it; a reply whose only visible part was an `<svg>`
  // read as empty and was refused. Both directions, one list.
  it('counts the pictures a reader can actually see, on both sides of the quote', () => {
    expect(collapseQuotedHistory(
      '<svg><circle r="1"/></svg><blockquote><p>the original</p></blockquote>')).not.toBeNull()
    expect(collapseQuotedHistory(
      '<p>hi</p><blockquote><p>the original</p></blockquote><table><tr><td>terms</td></tr></table>'))
      .toBeNull()
    expect(collapseQuotedHistory(
      '<p>hi</p><blockquote><p>the original</p></blockquote><iframe src="x"></iframe>')).toBeNull()
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
  // ⚠️ THE GUARD USED TO SHORT-CIRCUIT PAST ITSELF EXACTLY WHEN IT WAS NEEDED. It read
  // `bodyText && quoted.length >= bodyText.length`, so a body with NO TEXT — an image-only reply —
  // skipped the check entirely and hid its own image behind a bare `…`, indistinguishable from a
  // failed read. That is verbatim the case the guard is documented to prevent.
  it('leaves a body that is entirely quoted alone, text or not', () => {
    expect(collapseQuotedHistory('<blockquote><p>all of it</p></blockquote>')).toBeNull()
    expect(collapseQuotedHistory('<blockquote><img src="whole.png"></blockquote>')).toBeNull()
    expect(collapseQuotedHistory('<blockquote><table><tr><td><img src="a.png"></td></tr></table></blockquote>'))
      .toBeNull()
  })

  // ⚠️ AND IT MUST NOT REFUSE A REAL REPLY THAT HAPPENS TO CARRY NO TEXT. `textContent` cannot see
  // an image, so a picture above a quoted thread was being left uncollapsed for the same reason.
  it('still collapses when the reply above the quote is an image', () => {
    const out = collapseQuotedHistory('<img src="reply.png"><blockquote><p>the original</p></blockquote>')
    expect(out).not.toBeNull()
    expect(parse(out).querySelectorAll('.replied-content')).toHaveLength(1)
  })

  // ⚠️ THE TOGGLE MUST ACTUALLY TOGGLE. Dropping `for` or `type="checkbox"` leaves a label that
  // renders, a quote that is hidden and a click that does nothing — both were proven inert in
  // Chromium and both survived the first mutation battery.
  it('wires the label to the input, so the toggle is a toggle', () => {
    const d = parse(collapseQuotedHistory(sent()))
    const label = d.querySelector('label.collapse')
    const input = d.querySelector('input.replyCollapser')
    expect(input.getAttribute('type')).toBe('checkbox')
    expect(input.id).toBeTruthy()
    expect(label.getAttribute('for')).toBe(input.id)
  })

  // ⚠️ HEAD-HOISTED MARKUP MUST SURVIVE THE REWRITE, and dropping it shipped a ruling that was on
  // hold. A real browser hoists a leading `<style>`/`<meta>` into `<head>`, and returning
  // `doc.body.innerHTML` alone silently strips it — measured on production as 13 of 47 rewritten
  // messages losing head markup and 2 losing a live `<style>` block, which in Chromium turns a
  // paragraph's margin from 0px to 16px. The runner does not hoist, so the head is written
  // explicitly here: that both engines honour.
  it('keeps the sender stylesheet, which a real browser hoists into head', () => {
    const withHead =
      '<html><head><style>p{margin:0}</style><meta name="Generator" content="Word"></head>' +
      '<body><p>Yes, Tuesday works.</p><blockquote><p>the original</p></blockquote></body></html>'
    const out = collapseQuotedHistory(withHead)
    expect(out).toContain('<style>p{margin:0}</style>')
    expect(out).toContain('Generator')
    expect(out).toContain('replied-content')
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
