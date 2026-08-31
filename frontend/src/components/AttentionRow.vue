<template>
  <!-- ONE ROOT: the row and the message it expands to are one item, so a fragment root would let
       the two drift apart in a list. -->
  <div class="border-b border-outline-gray-1">
  <div
    data-testid="attention-row"
    class="group flex cursor-pointer items-center gap-2 py-1 pr-2 text-sm hover:bg-surface-gray-1"
    :class="card.critical ? 'border-l-2 border-l-ink-red-4 pl-1.5' : 'pl-2'"
    @click="$emit('open', card)"
  >
    <!-- ⚠️ THE EXPANDER IS A BUTTON INSIDE A CLICKABLE ROW, so it stops the click. Without that,
         reading what the customer said would navigate away from the list — the opposite of what
         an expander is for. -->
    <button
      class="-my-1 shrink-0 self-stretch px-1 text-ink-gray-4 hover:text-ink-gray-7"
      :aria-expanded="open"
      :aria-label="open ? __('Hide message') : __('Show message')"
      @click.stop="open = !open"
    >
      <span class="inline-block transition-transform" :class="open ? 'rotate-90' : ''">›</span>
    </button>

    <span class="w-44 shrink-0 truncate font-medium text-ink-gray-8">{{ card.who }}</span>

    <!-- The subject rarely changes through a thread, so it stops being informative after the first
         message — but it still tells two deals from the same organisation apart. Alan's call,
         rev 3 §7, and it sits beside the snippet rather than instead of it. -->
    <span class="min-w-0 flex-1 truncate text-ink-gray-5">{{ card.subject }}</span>

    <!-- ⚠️ STATUS IS CONTEXT ON THE ROW, and that is all it is. Alan's correction of 31 August:
         this list is about not missing correspondence, not about ranking deals — the Kanban ranks
         deals. Status decides the ORDER the server sends and can raise a row to critical; it
         never decides whether a row is here. -->
    <!-- ⚠️ A COMPACT BADGE, NOT INLINE TEXT. Alan on production: "· out of date" truncated to
         "out of …" on every row — carrying no information and consuming a column. A short badge
         with the meaning in its tooltip fits, and the ordering it drives is unchanged. -->
    <span class="hidden w-32 shrink-0 truncate text-xs lg:block"
          :class="card.critical ? 'text-ink-gray-7' : 'text-ink-gray-5'">{{ card.status
      }}<span v-if="card.status_stale"
              class="ml-1 rounded bg-surface-gray-2 px-1 text-[10px] font-medium text-ink-gray-7"
              :title="__('The status has not been set since the contact last wrote, so it may not be current.')"
        >{{ __('stale') }}</span></span>

    <!-- ⚠️ THE WORDS CARRY THE MEANING; THE COLOUR ONLY EMPHASISES IT (rev 3 §8). A critical row
         says "critical" in words, so the list still reads correctly to someone who cannot
         distinguish the colours.
         ⚠️ AND THE AMBER MOVED FROM THE INK TO THE GROUND, WHICH IS THE PALETTE FIX. Alan: the
         yellow has too little contrast to read. It cannot be fixed by going darker — `ink-amber-3`
         IS amber-600, the darkest amber frappe-ui defines, and amber-600 on white is about 3:1,
         under the 4.5:1 small text needs. So the colour became the BACKGROUND and the text became
         `ink-gray-8`, which reads at 12px and still signals. Applied wherever this surface used
         amber for text, not just here — see `Attention.vue`. -->
    <span class="hidden w-20 shrink-0 md:block">
      <!-- ⚠️ THREE STATES, NOT TWO. Anything that was not `waiting_on_us` read as "we wrote last",
           so an `unknown` row — one whose direction could not be read at all — CLAIMED the customer
           had been answered. That is the one thing this surface must never say wrongly. Not
           reachable from the page today, but `get_attention` is whitelisted and returns those rows
           when asked, and a label that lies when called directly will lie on the page eventually. -->
      <!-- "Last By" — who sent the most recent message. Alan's words: `us` and `contact`. -->
      <span class="rounded px-1.5 py-0.5 text-xs"
            :class="card.state === 'waiting_on_us'
              ? 'bg-surface-amber-1 font-medium text-ink-gray-8'
              : 'text-ink-gray-5'">
        {{ card.state === 'waiting_on_us' ? __('contact')
           : card.state === 'unknown' ? __('unknown') : __('us') }}
      </span>
    </span>

    <span class="w-28 shrink-0 text-right text-xs tabular-nums"
          :class="card.critical ? 'font-medium text-ink-red-6' : 'text-ink-gray-6'">
      {{ ageLabel }}
    </span>
    <!-- ⚠️ THE ROW SAYS WHY IT IS CRITICAL. A disjunction above the list — "5 days or more, or far
         enough along to lose" — cannot tell the reader which half applies to the row they are
         looking at, which is how three `Ready to Close` rows at age 0 read as a fault. The reason
         comes from the server, from the same expression as the flag. -->
    <span class="w-16 shrink-0 text-right text-xs font-medium text-ink-red-6"
          :title="criticalWhy">{{ criticalLabel }}</span>
  </div>

  <!-- What they actually said. Measured against 38 real production emails before it was built:
       the literal first line was "Hi Alicia," on 30 of them, so `first_line` skips a line that is
       only a greeting. See `crm_attention.first_line`. -->
  <div v-if="open" class="bg-surface-gray-1 py-1.5 pl-10 pr-3 text-xs"
       :class="card.snippet ? 'text-ink-gray-7' : 'text-ink-gray-4'">
    {{ card.snippet || (degraded
       ? __('The message could not be read just now — open the deal to read the thread.')
       : __('No message text was recorded — open the deal to read the thread.')) }}
  </div>
  </div>
</template>

<script setup>
/**
 * One row of the attention list. A ROW, not a card — rev 3 §3.
 *
 * ⚠️ DENSITY IS THE POINT. Alan's read of the built surface: *"There is a lot of white space. The
 * list could have 30–50 items. The scroll is clumsy."* Each item used to spend a card's height
 * carrying four short values. One line, a hairline rule, no card treatment, and the critical group
 * stays distinct by weight and colour rather than by height.
 *
 * ⚠️ `card.critical` IS READ, NEVER RE-DERIVED. The rule lives in
 * `lc_winnow.api.crm_attention.is_critical` so that a second dimension — scope, when Alan defines
 * it — is one `or` on the server and nothing here moves.
 *
 * ⚠️ AND THE AGE IS READ TOO. It is days since THEIR last message (rev 3 §7), computed server-side
 * from the newest inbound Communication. It is not days since `last_correspondence_at`, which is
 * ours on any deal awaiting their decision.
 */
import { ref, computed } from 'vue'

// ⚠️ `degraded` EXISTS SO THE ROW CANNOT MAKE A CLAIM IT CANNOT SUBSTANTIATE. When the server
// could not read the messages at all, every snippet arrives empty — and "No message text was
// recorded" is then FALSE: the text is recorded, it could not be read. Two different facts, and
// the estate's whole standard here is that they must not be shown as one.
const props = defineProps({
  card: { type: Object, required: true },
  degraded: { type: Boolean, default: false },
})
defineEmits(['open'])

const open = ref(false)

// ⚠️ READS `display_age_days`, NOT `age_days`. A row saying "we wrote last" and "not heard from"
// at once was two true facts arranged to look like a fault: `age_days` is measured from the
// CONTACT's last message and is absent when they have never written. The displayed age falls back
// to how long OUR message has been sitting, and `Last By` already says which it is — so the two
// columns can no longer disagree. The server computes both; this never subtracts a date.
const ageLabel = computed(() => {
  const d = props.card.display_age_days ?? props.card.age_days
  // "never" rather than a dash: a dash reads as missing data, and this is a declared fact — there
  // has been no correspondence from them at all. It should be unreachable on a listed row, since
  // a row is only listed when somebody has written; it is the safety net, not the common case.
  if (d === null || d === undefined) return __('never')
  if (d === 0) return __('today')
  if (d === 1) return __('1 day')
  return __('{0} days', [d])
})

const criticalLabel = computed(() =>
  props.card.critical ? (props.card.critical_because || []).join(' + ') || __('yes') : '')
const criticalWhy = computed(() => {
  const w = props.card.critical_because || []
  if (!props.card.critical) return ''
  const say = []
  if (w.includes('age')) say.push(__('no reply for 5 days or more'))
  if (w.includes('stage')) say.push(__('far enough along to lose'))
  return say.join('; ')
})
</script>
