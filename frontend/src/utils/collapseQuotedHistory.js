/**
 * Collapse the quoted reply history behind the same `…` toggle the other quote shapes already use,
 * for the bare `<blockquote>` form that the three existing selectors all miss.
 *
 * ⚠️ WHY A FOURTH SHAPE. `EmailContent.vue` collapses `div.gmail_quote`, `div#appendonsend` and
 * `p.reply-to-content`. Measured read-only on production over the 100 most recent CRM-linked
 * Communications, those three match 21; a further 46 quote with a bare `<blockquote>` and nothing
 * else. **No Sent message is ever collapsed today**: across all 307 CRM-linked Sent rows, 36 carry
 * a `<blockquote>` and exactly 1 carries `gmail_quote`, because the CRM's own composer emits
 * `<blockquote>${message}</blockquote>` with no class and no `On … wrote:` header
 * (`EmailArea.vue:126`). Its own outgoing mail is the population least served.
 *
 * ⚠️ AND `p.reply-to-content` WAS NEVER THE MECHANISM FOR IT — it appears in 1 of the 1773 Sent
 * Communications in the whole production table, and collapses a paragraph's FOLLOWING SIBLINGS
 * rather than a blockquote. Whatever drops that class in the editor is a separate, older, inert
 * defect; fixing it would not collapse anything.
 *
 * ⚠️ NO RECURSION, AND THAT IS NOT A STYLE CHOICE. `parseReplyToContent`'s `handleAllInstances`
 * recurses until `querySelectorAll(selector)` is empty, which terminates only because each branch
 * makes the element STOP MATCHING — the Gmail branch removes the class from its clone. A tag name
 * cannot be un-matched, so the same shape would recurse forever on its own output.
 */

// ⚠️ WHAT A READER WOULD NOTICE, AND THE LIST IS WIDER THAN IT WAS. It read `img, table, video`,
// which the second review showed is half a rule: an `<svg>` or an `<iframe>` AFTER the quote did
// not block a collapse (so the collapse hid content), while a reply whose only visible part was an
// inline `<svg>` read as empty (so it was refused) — the same class of failure as the image-only
// bug the previous commit fixed, fixed halfway.
const VISIBLE = 'img, table, video, svg, iframe, object, audio, picture'

/** Content a reader would notice. `textContent` alone cannot see a picture. */
function meaningful(node) {
  if (!node) return false
  return Boolean((node.textContent || '').trim() || node.querySelector(VISIBLE))
}

/**
 * What sits before and after the quote IN DOCUMENT ORDER, wherever it is nested.
 *
 * ⚠️ THE FIRST VERSION WALKED `doc.body.childNodes` AND `continue`d PAST THE WHOLE NODE CONTAINING
 * THE QUOTE, so one wrapping `<div>` made everything inside it invisible to both guards — and it
 * failed in BOTH directions on real production mail. A row with 1643 characters of the sender's
 * own reply inside a wrapper was refused as "the whole message is quote", which was untrue of it.
 * And the pull-quote protection was defeated by the same div: `<p>Hi</p><div><blockquote>THEIR
 * WORDS</blockquote><p>I disagree</p></div>` collapsed, hiding what was being replied to — verbatim
 * the inversion that guard exists to prevent. Two semantically identical messages got opposite
 * answers depending on the sender's mail client's nesting.
 */
function surroundings(doc, quote) {
  const before = { seen: false }
  const after = { seen: false }
  const walk = doc.createTreeWalker(doc.body, 5 /* SHOW_ELEMENT | SHOW_TEXT */)
  let node
  while ((node = walk.nextNode())) {
    if (node === quote || quote.contains(node)) continue
    const pos = quote.compareDocumentPosition(node)
    // An ANCESTOR of the quote contains it, so its own text already covers both sides — counting
    // the element itself would credit the quote's content to whichever side it sits on.
    if (pos & 8 /* CONTAINS */) continue
    const side = pos & 2 /* PRECEDING */ ? before : pos & 4 /* FOLLOWING */ ? after : null
    if (!side) continue
    if (node.nodeType === 3) {
      if ((node.textContent || '').trim()) side.seen = true
    } else if (node.matches && node.matches(VISIBLE)) {
      side.seen = true
    }
  }
  return { before: before.seen, after: after.seen }
}

/**
 * @param {string} html - the Communication's stored content
 * @returns {string|null} the rewritten HTML, or `null` for "leave the content exactly as it was" —
 *   which is a different answer from "the content is now empty".
 */
export function collapseQuotedHistory(html) {
  if (!html) return null
  const doc = new DOMParser().parseFromString(html, 'text/html')

  // ⚠️ TOP-LEVEL ONLY. Each reply wraps the last, so production Sent mail nests to depth 11.
  // Collapsing an inner one puts a toggle inside already-hidden content; collapsing every one
  // nests eleven toggles for a single thread.
  // ⚠️ AND ALREADY-COLLAPSED QUOTES ARE SKIPPED, so the function is idempotent rather than merely
  // terminating. An earlier comment justified this by claiming `EmailContent.vue` watches
  // `props.content` — IT DOES NOT. Its only watcher is on `iframeRef`, `_content` is computed once
  // in setup, and the result is never written back. The filter is kept because it is cheap and
  // because double-wrapping is a real output defect if anything ever does re-enter, but the
  // justification is now what was measured rather than what was assumed. §0.2g.
  const quotes = Array.from(doc.querySelectorAll('blockquote')).filter(
    (el) =>
      !el.parentElement?.closest('blockquote') &&
      !el.parentElement?.closest('.replied-content'),
  )
  if (!quotes.length) return null

  // ⚠️ THE LAST ONE, AND ONLY THE LAST ONE. The first version collapsed EVERY top-level quote, and
  // the adversarial review measured what that does to real mail: 4 of 47 newly-collapsed
  // production messages emitted two or more `…` pills, because Apple Mail puts the attribution
  // line and the quoted body in two SIBLING blockquotes — the first pill opening to nothing but
  // "On … wrote:". A further 7 of 47 put a pill inside a signature table, mid-message, nowhere
  // near a reply boundary. One collapse, at the end, is what "the boundary between what this
  // message says and everything before it" actually means.
  // ⚠️ THE LAST QUOTE THAT HAS ANYTHING IN IT — taking the last one BLINDLY made an empty trailing
  // quote refuse the whole message, so real quoted history rendered fully expanded while the guard
  // congratulated itself on not hanging a toggle on nothing.
  //
  // ⚠️ CORRECTED: THE ROW PREVIOUSLY CITED AS RESCUED BY THIS IS NOT RESCUED BY IT. `8hc79tec7j`
  // was named in the last commit as the case this fix recovers. It is not: with this code the row
  // is still refused, now because its `littlecocoa.com.au` signature block sits after the quote, so
  // its 3642 characters still render expanded. The change is right in principle and the row was the
  // wrong evidence for it. Recorded because this branch has already shipped three wrong numbers, and
  // a wrong worked example is the same defect wearing a narrative.
  //
  // ⚠️ AND IT IS ONLY THE EMPTY TRAILING QUOTE THAT IS HANDLED. A trailing top-level quote with ANY
  // content still captures the toggle and leaves the real history expanded — an Outlook
  // "CONFIDENTIAL" disclaimer in a signature table does exactly that. Zero incidence across all 370
  // CRM-linked production rows, and no content is lost when it happens: the message renders no worse
  // than it does today. Known, measured, and not fixed.
  const quote = quotes.filter(meaningful).pop()
  if (!quote) return null

  // ⚠️ SOMETHING MUST PRECEDE IT AND NOTHING MAY FOLLOW IT, and both halves were defects.
  //
  // NOTHING AFTER: a `<blockquote>` with the author's own words after it is a PULL QUOTE, not a
  // reply boundary — StarterKit's blockquote is enabled in the composer, so a person can type one,
  // and it is byte-identical to a machine boundary. Collapsing it hides the thing being replied to
  // and inverts the meaning.
  //
  // ⚠️ AND IT IS NOT FREE, WHICH AN EARLIER COMMENT CLAIMED. "35 of 35 Sent rows have the quote
  // last, so requiring it costs the target population nothing" was 35 of 36 — one row is a genuine
  // BOTTOM-POSTED reply from the CRM's own composer, and this rule refuses it. Measured over the 47
  // bare-blockquote rows in the sample, with this exact code in Chromium: 39 collapse (one toggle
  // each, none opening to nothing) and 8 are refused, every one for content after the quote —
  // bottom-posted replies, and disclaimers or signatures following the quoted history. Refusing is
  // the conservative direction (the message renders exactly as it does today), and whether to trade
  // those 8 for pull-quote safety is a ruling. Recorded rather than presented as costless.
  //
  // SOMETHING BEFORE: otherwise the whole message is quote and it renders as a bare `…`,
  // indistinguishable from a failed read. The first version guarded this with
  // `bodyText && quoted.length >= bodyText.length`, which SHORT-CIRCUITED PAST ITSELF exactly when
  // the body had no text — an image-only reply hid its own image behind the toggle. `meaningful`
  // counts images and tables for that reason.
  const { before, after } = surroundings(doc, quote)
  if (!before) return null
  if (after) return null

  collapse(doc, quote)

  // ⚠️ `doc.head.innerHTML` IS NOT OPTIONAL, AND OMITTING IT SHIPPED A RULING THAT WAS ON HOLD.
  // `DOMParser` runs the real parsing algorithm, so a `<style>`, `<meta>` or `<link>` appearing
  // before any body content is HOISTED INTO `<head>` — and returning `doc.body.innerHTML` alone
  // silently drops it. Before this branch, a bare-blockquote message matched no selector, the raw
  // string went to the iframe untouched, and the browser applied those rules.
  //
  // The adversarial review measured the loss on 370 real production Communications: of the 47
  // messages this branch newly rewrites, 13 lost head-hoisted markup and 2 lost an actual
  // `<style>` block — and in Chromium that turns a paragraph's `margin-bottom` from 0px to 16px
  // and its colour from the sender's to black. Stripping sender `<style>` is the half of the
  // 1 September ruling that was HELD precisely because it ADDS whitespace. "Not in scope" is not
  // the same as "not shipped".
  //
  // ⚠️ jsdom AND happy-dom DO NOT HOIST, so no unit test could see this: the style stays in `body`
  // under the runner and moves to `head` under Chromium. `16-head` below constructs the head
  // explicitly, which both engines honour.
  return doc.head.innerHTML + doc.body.innerHTML
}

function collapse(doc, quote) {
  const parent = quote.parentElement
  if (!parent) return

  // ⚠️ THE RANDOM ID IS BELT-AND-BRACES, NOT A CONTROL, AND THE DIFFERENCE IS WORTH STATING.
  // Replacing it with a fixed string survives the mutation battery, and correctly: only ONE quote
  // is ever collapsed per message now, and `EmailContent` renders each Communication into its own
  // iframe, so the `label for` / `input id` pair is alone in its document and cannot collide. It
  // stays random because it costs nothing; a test asserting randomness would be asserting the
  // implementation rather than a property, which is how a suite acquires a maintenance tax.
  const id = 'q' + Math.random().toString(36).substring(2, 9)
  const wrapper = doc.createElement('div')
  wrapper.classList.add('replied-content')

  const label = doc.createElement('label')
  label.classList.add('collapse')
  // ⚠️ `for` AND `type` ARE WHAT MAKE THE TOGGLE A TOGGLE. Dropping either leaves a label that
  // renders, a quote that is hidden, and a click that does nothing — proven inert in Chromium.
  label.setAttribute('for', id)
  label.innerHTML = '...'
  wrapper.appendChild(label)

  const input = doc.createElement('input')
  input.setAttribute('id', id)
  input.setAttribute('class', 'replyCollapser')
  input.setAttribute('type', 'checkbox')
  wrapper.appendChild(input)

  // ⚠️ THE `<div>` IS LOAD-BEARING. The stylesheet hides the quote with
  // `.replied-content .collapse + input + div { display: none }` and reveals it with
  // `+ input:checked + div`, so an adjacent-sibling chain naming `div` matches nothing if the
  // blockquote is appended directly — and the toggle renders and does nothing.
  const shell = doc.createElement('div')
  parent.replaceChild(wrapper, quote)
  shell.appendChild(quote)
  wrapper.appendChild(shell)
}
