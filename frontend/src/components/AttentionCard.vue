<template>
  <button
    class="w-full rounded-md border bg-surface-white p-2 text-left hover:border-outline-gray-3"
    :class="card.critical ? 'border-outline-red-2 bg-surface-red-1' : 'border-outline-gray-2'"
    @click="$emit('open', card)"
  >
    <div class="flex items-baseline justify-between gap-2">
      <span class="truncate text-sm font-medium text-ink-gray-8">{{ card.who }}</span>
      <span class="shrink-0 text-xs" :class="card.critical ? 'text-ink-red-6' : 'text-ink-gray-5'">
        {{ card.age_days !== null ? age : __('date unreadable') }}
      </span>
    </div>
    <div class="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-gray-5">
      <!-- ⚠️ THE WORDS CARRY THE MEANING; THE COLOUR ONLY EMPHASISES IT. A critical card says so,
           so the list still reads correctly to someone who cannot distinguish the colours. -->
      <Badge v-if="card.critical" variant="subtle" theme="red" :label="__('Critical')" />
      <Badge v-if="card.state === 'waiting_on_us'" variant="subtle" theme="orange"
             :label="__('they wrote last')" />
      <Badge v-else-if="card.state === 'awaiting_them'" variant="subtle" theme="gray"
             :label="__('awaiting their decision')" />
      <span class="truncate">{{ card.status }}</span>
    </div>
  </button>
</template>

<script setup>
/**
 * One row of the attention list. Rev 2 §5 adds the subject and a first-line snippet behind an
 * expander; both need `get_attention` to carry them and are the next stage, not this one.
 *
 * ⚠️ `card.critical` is READ, never re-derived. The rule lives in
 * `lc_winnow.api.crm_attention.is_critical` so that a second dimension — scope, when Alan defines
 * it — is one `or` on the server and nothing here moves.
 */
import { computed } from 'vue'
import { Badge } from 'frappe-ui'

const props = defineProps({ card: { type: Object, required: true } })
defineEmits(['open'])

// §5: measured from THEIR last message, so it reads as "they have been waiting this long".
const age = computed(() =>
  props.card.age_days === 1 ? __('1 day') : __('{0} days', [props.card.age_days]))
</script>
