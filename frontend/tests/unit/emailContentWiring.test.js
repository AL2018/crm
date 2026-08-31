import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import EmailContent from '@/components/Activities/EmailContent.vue'

// ⚠️ THIS FILE EXISTS BECAUSE THE HELPER'S OWN TESTS CANNOT SEE WHETHER IT IS CALLED. Unwiring
// `collapseQuotedHistory` from `EmailContent.vue` left all eight of them green — the same defect
// the `lc_winnow 7075733` review found, where a suppression helper was fully tested and never
// asserted to be wired into the payload. A helper nobody calls is a helper that works perfectly.
//
// It asserts the rendered `srcdoc`, which is what the iframe actually receives.

// ⚠️ THE BODY ONLY. The `srcdoc` embeds the whole stylesheet, which itself contains
// `.replied-content` rules — so asserting `not.toContain('replied-content')` over the whole
// document passes on the CSS and proves nothing about the message. A first draft of this file did
// exactly that and went green against an uncollapsed body.
const srcdoc = (content) => {
  const doc = mount(EmailContent, { props: { content } }).find('iframe').attributes('srcdoc')
  return doc.slice(doc.indexOf('<body>'))
}

describe('EmailContent — the quoted-history branch is actually wired in', () => {
  it('collapses a bare blockquote in the document it hands the iframe', () => {
    const out = srcdoc('<p>Yes, Tuesday works.</p><p></p><blockquote><p>the original</p></blockquote>')
    expect(out).toContain('replied-content')
    expect(out).toContain('replyCollapser')
  })

  it('leaves a message with no quote exactly as it was', () => {
    const out = srcdoc('<p>Just a note, nothing quoted.</p>')
    expect(out).toContain('Just a note, nothing quoted.')
    expect(out).not.toContain('replied-content')
  })

  // ⚠️ THE EXISTING SHAPES KEEP THEIR OWN BRANCH. The new one is LAST precisely so that nothing
  // already handled changes behaviour — and a Gmail quote is a `div`, so if the blockquote branch
  // ever ran first it would still collapse, silently taking a different path with different markup.
  it('still uses the gmail branch for a gmail quote', () => {
    const out = srcdoc('<p>hi</p><div class="gmail_quote"><p>quoted</p></div>')
    expect(out).toContain('replied-content')
    expect(out).not.toContain('gmail_quote')
  })
})
