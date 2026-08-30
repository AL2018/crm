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
    <span class="hidden w-32 shrink-0 truncate text-xs lg:block"
          :class="card.critical ? 'text-ink-gray-7' : 'text-ink-gray-5'">{{ card.status
      }}<span v-if="card.status_stale" class="ml-1 font-medium text-ink-gray-8"
              :title="__('They have written since this status was set')">{{ __('· out of date') }}</span></span>

    <!-- ⚠️ THE WORDS CARRY THE MEANING; THE COLOUR ONLY EMPHASISES IT (rev 3 §8). A critical row
         says "critical" in words, so the list still reads correctly to someone who cannot
         distinguish the colours.
         ⚠️ AND THE AMBER MOVED FROM THE INK TO THE GROUND, WHICH IS THE PALETTE FIX. Alan: the
         yellow has too little contrast to read. It cannot be fixed by going darker — `ink-amber-3`
         IS amber-600, the darkest amber frappe-ui defines, and amber-600 on white is about 3:1,
         under the 4.5:1 small text needs. So the colour became the BACKGROUND and the text became
         `ink-gray-8`, which reads at 12px and still signals. Applied wherever this surface used
         amber for text, not just here — see `Attention.vue`. -->
    <span class="hidden w-28 shrink-0 md:block">
      <span class="rounded px-1.5 py-0.5 text-xs"
            :class="card.state === 'waiting_on_us'
              ? 'bg-surface-amber-1 font-medium text-ink-gray-8'
              : 'text-ink-gray-5'">
        {{ card.state === 'waiting_on_us' ? __('they wrote last') : __('we wrote last') }}
      </span>
    </span>

    <span class="w-24 shrink-0 text-right text-xs tabular-nums"
          :class="card.critical ? 'font-medium text-ink-red-6' : 'text-ink-gray-6'">
      {{ ageLabel }}
    </span>
    <span class="w-14 shrink-0 text-right text-xs font-medium text-ink-red-6">
      {{ card.critical ? __('critical') : '' }}
    </span>
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

const ageLabel = computed(() => {
  if (props.card.age_days === null || props.card.age_days === undefined)
    return __('not heard from')
  if (props.card.age_days === 0) return __('today')
  if (props.card.age_days === 1) return __('1 day')
  return __('{0} days', [props.card.age_days])
})
</script>
