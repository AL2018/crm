/**
 * Collapse a bare `<blockquote>` reply boundary behind the same `…` toggle the other quote
 * shapes already use.
 *
 * ⚠️ WHY A FOURTH SHAPE. `EmailContent.vue` collapses `div.gmail_quote`, `div#appendonsend` and
 * `p.reply-to-content`. Measured on production over 100 recent CRM-linked Communications, those
 * three match only 20 of them — 63 rows quote with a bare `<blockquote>` and nothing else, and
 * **no Sent message is ever collapsed**: across all 307 CRM-linked Sent rows, 36 carry a
 * `<blockquote>` and exactly 1 carries `gmail_quote`. The CRM's own composer emits
 * `<blockquote>${message}</blockquote>` with no class and no `On … wrote:` header
 * (`EmailArea.vue:129`), so its own outgoing mail is the population least served by the selectors.
 *
 * ⚠️ AND `p.reply-to-content` WAS NEVER THE MECHANISM FOR IT. That class appears in 1 of the 1773
 * Sent Communications in the entire production table, and even where it appears it collapses the
 * paragraph's FOLLOWING SIBLINGS rather than a blockquote. Whatever drops the class in the editor
 * is a separate, older defect; it is not what leaves Sent messages uncollapsed, and fixing it would
 * not collapse them.
 *
 * ⚠️ NO RECURSION, AND THAT IS NOT A STYLE CHOICE. `parseReplyToContent`'s `handleAllInstances`
 * recurses until `querySelectorAll(selector)` is empty, which terminates only because each branch
 * makes the element STOP MATCHING — the Gmail branch removes the class from its clone. A tag name
 * cannot be un-matched, so the same shape would recurse forever on its own output. The elements are
 * collected once, up front, and iterated.
 */

/**
 * @param {string} html - the Communication's stored content
 * @returns {string|null} the rewritten HTML, or `null` when there is nothing to collapse — `null`
 *   is "leave the content exactly as it was", which is different from "the content is now empty".
 */
export function collapseQuotedHistory(html) {
  if (!html) return null
  const doc = new DOMParser().parseFromString(html, 'text/html')

  // ⚠️ TOP-LEVEL ONLY. Each reply wraps the last, so quoting runs to depth 11 on production Sent
  // mail. Collapsing an inner one would put a toggle inside already-hidden content, and collapsing
  // every one would nest eleven toggles for a single thread. The outermost is the boundary between
  // what this message says and everything said before it.
  // ⚠️ AND ALREADY-COLLAPSED QUOTES ARE SKIPPED, which is what makes this idempotent rather than
  // merely terminating. `EmailContent.vue` watches `props.content`, so a second pass over its own
  // output is reachable — and without this it wrapped the same quote twice, producing two nested
  // toggles the reader would have to open in turn. Caught by re-running the function on its own
  // output, which is the only way this shows up.
  const quotes = Array.from(doc.querySelectorAll('blockquote')).filter(
    (el) =>
      !el.parentElement?.closest('blockquote') &&
      !el.parentElement?.closest('.replied-content'),
  )
  if (!quotes.length) return null

  // ⚠️ A BODY THAT IS ENTIRELY QUOTE WOULD COLLAPSE TO NOTHING — a message rendering as a bare
  // `…` with no way to tell it from a failed read. Measured at zero on production (0 of 1773 Sent
  // and 0 of 63 CRM-linked Received rows begin with `<blockquote`), so this guard is not expected
  // to fire; it exists because "measured zero today" is not "cannot happen", and the failure it
  // prevents is silent.
  const visibleText = (node) => (node.textContent || '').trim()
  const bodyText = visibleText(doc.body)
  const quotedText = quotes.map(visibleText).join('')
  if (bodyText && quotedText.length >= bodyText.length) return null

  for (const quote of quotes) collapse(doc, quote)
  return doc.body.innerHTML
}

function collapse(doc, quote) {
  const parent = quote.parentElement
  if (!parent) return

  const id = Math.random().toString(36).substring(2, 7)
  const wrapper = doc.createElement('div')
  wrapper.classList.add('replied-content')

  const label = doc.createElement('label')
  label.classList.add('collapse')
  label.setAttribute('for', id)
  label.innerHTML = '...'
  wrapper.appendChild(label)

  const input = doc.createElement('input')
  input.setAttribute('id', id)
  input.setAttribute('class', 'replyCollapser')
  input.setAttribute('type', 'checkbox')
  wrapper.appendChild(input)

  // ⚠️ THE `<div>` IS LOAD-BEARING AND IS NOT A WRAPPER FOR TIDINESS. The stylesheet hides the
  // quote with `.replied-content .collapse + input + div { display: none }` and reveals it with
  // `+ input:checked + div` (`EmailContent.vue:145-149`). An adjacent-sibling chain naming `div`
  // matches nothing if the blockquote is appended directly, so the toggle would render and do
  // nothing at all — visible, plausible, and inert.
  const shell = doc.createElement('div')
  parent.replaceChild(wrapper, quote)
  shell.appendChild(quote)
  wrapper.appendChild(shell)
}
