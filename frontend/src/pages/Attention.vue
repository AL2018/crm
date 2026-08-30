<template>
  <LayoutHeader>
    <template #left-header>
      <div class="flex items-center gap-2">
        <span class="text-lg font-medium text-ink-gray-8">{{ __('Needs attention') }}</span>
      </div>
    </template>
    <template #right-header>
      <Button :label="__('Refresh')" :loading="board.loading" @click="board.reload()" />
    </template>
  </LayoutHeader>

  <div class="flex h-full flex-col overflow-hidden px-5 py-4">
    <!-- §3 — the size of the task. `to_clear` is `performed + to_go` server-side, so these three
         cannot disagree on the page. Nothing is marked done by hand: an item leaves because
         someone replied. -->
    <div v-if="stats" class="mb-4 flex flex-wrap gap-6 text-sm">
      <div><span class="text-ink-gray-5">{{ __('To clear') }}</span>
        <span class="ml-2 font-medium text-ink-gray-8">{{ stats.to_clear ?? '—' }}</span></div>
      <div><span class="text-ink-gray-5">{{ __('Performed') }}</span>
        <span class="ml-2 font-medium text-ink-gray-8">{{ stats.performed ?? '—' }}</span></div>
      <div><span class="text-ink-gray-5">{{ __('To go') }}</span>
        <span class="ml-2 font-medium text-ink-gray-8">{{ stats.to_go }}</span></div>
      <!-- §4 — colour carries emphasis, never meaning on its own, so the count says "critical"
           in words too. -->
      <div v-if="board.data?.critical">
        <span class="text-ink-red-6">{{ __('Critical') }}</span>
        <span class="ml-2 font-medium text-ink-red-6">{{ board.data.critical }}</span>
      </div>
    </div>

    <div v-if="board.loading && !board.data" class="text-ink-gray-5 text-sm">{{ __('Loading…') }}</div>

    <!-- ⚠️ THE EMPTY STATE MUST NOT CLAIM AN ALL-CLEAR IT CANNOT SUBSTANTIATE. Three ways to be
         empty and only one is good news, so green is the LAST branch. Carried across from the desk
         version, where a real Sales User was shown "everything answered" over ten waiting deals
         because the count was taken AFTER row scoping. -->
    <div v-else-if="board.data && !board.data.total" class="text-sm">
      <div v-if="!board.data.open_total" class="rounded border border-outline-gray-2 p-4">
        <div class="font-medium text-ink-gray-8">
          {{ __('There is nothing on this list for you, and that is not the same as an all-clear.') }}
        </div>
        <div class="mt-1 text-ink-gray-5">
          {{ __('Either there are no open deals at all, or none of the open deals are yours to see. This list cannot tell the difference, so it is not telling you everything is answered.') }}
        </div>
      </div>
      <div v-else-if="board.data.unlinked || board.data.unassessable"
           class="rounded border border-outline-gray-2 p-4">
        <div class="font-medium text-ink-gray-8">
          {{ __('Nothing to show, and this list cannot yet tell you why.') }}
        </div>
        <div class="mt-1 text-ink-gray-5">{{ causeText }}</div>
      </div>
      <div v-else class="rounded border border-outline-green-2 bg-surface-green-1 p-4 text-ink-green-3">
        {{ __('Nothing is waiting. All {0} open deals have been answered.', [board.data.open_total]) }}
      </div>
    </div>

    <!-- ⚠️ CRITICAL VERSUS EVERYTHING ELSE — NOT THREE EQUAL COLUMNS. Rev 2 §4: colour only works
         if most of the list is not coloured. Three equal bands gave every card a heading of the
         same weight and left nothing for emphasis to mean. The bands still exist in the data and
         still order the list; they just do not each get a column. -->
    <div v-else-if="board.data" class="flex flex-1 flex-col gap-4 overflow-y-auto">
      <div v-if="critical.length">
        <div class="mb-2 flex items-center gap-2">
          <span class="text-sm font-medium text-ink-red-6">{{ __('Critical') }}</span>
          <span class="text-xs text-ink-gray-5">{{ criticalWhy }}</span>
        </div>
        <div class="flex flex-col gap-2">
          <AttentionCard v-for="card in critical" :key="card.deal" :card="card" @open="open" />
        </div>
      </div>

      <div v-if="rest.length">
        <div class="mb-2 text-sm font-medium text-ink-gray-6">
          {{ critical.length ? __('Everything else') : __('Waiting') }}
          <span class="ml-1 text-xs font-normal text-ink-gray-5">{{ rest.length }}</span>
        </div>
        <div class="flex flex-col gap-2">
          <AttentionCard v-for="card in rest" :key="card.deal" :card="card" @open="open" />
        </div>
      </div>
    </div>

    <div v-if="board.data?.unlinked || board.data?.unassessable"
         class="mt-3 rounded border border-outline-amber-2 bg-surface-amber-1 p-2 text-xs text-ink-amber-3">
      {{ causeText }}
    </div>
  </div>
</template>

<script setup>
/**
 * "Needs attention" — the working surface.
 *
 * ⚠️ IT IS A CRM ROUTE, NOT A DESK PAGE, AND THAT IS §2 OF `CC-BRIEF-ATTENTION-V2`. Alan's ask was
 * *"easy facility to focus on the associated lead / deal, action and return to attend to the next"*,
 * judged by the round trip rather than the click. The desk and the CRM are separate applications
 * with separate bundles (2.6 MB and 1.4 MB), so every crossing was a full application boot — twice
 * per item — and the list was rebuilt from scratch on the way back. As a route it is `router.push`:
 * no page load, native back, and the list is still there.
 *
 * ⚠️ AND THE LOOP CLOSES ITSELF. Nothing is marked done by hand — the architect's ruling is that an
 * item is cleared when someone REPLIES. So after acting on a deal and coming back, the item has
 * left the list on its own and the next one is at the top. A "mark as done" button would let an
 * item leave without the customer being answered, which is the one thing this surface exists to
 * prevent.
 *
 * The computation is not here and must never be: `lc_winnow.api.crm_attention.get_attention` owns
 * the states, the bands and the critical rule, and this file only renders what it is given. The
 * `critical` flag is READ, never re-derived from the band name — otherwise the colour and the words
 * could disagree.
 */
import { computed, onActivated, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Button, createResource } from 'frappe-ui'
import LayoutHeader from '@/components/LayoutHeader.vue'
import AttentionCard from '@/components/AttentionCard.vue'

const router = useRouter()

const board = createResource({
  url: 'lc_winnow.api.crm_attention.get_attention',
  auto: true,
})

// Coming back from a deal must show the current truth, not the list as it was when you left it —
// that is what makes the round trip a loop rather than a stale page.
onMounted(() => board.reload())
onActivated(() => board.reload())

const stats = computed(() => board.data?.stats)

// ⚠️ ORDER COMES FROM THE SERVER, WHICH SORTS OLDEST FIRST. These two only PARTITION the list —
// they never re-sort it and never re-derive `critical` from the band name, or the colour and the
// words could disagree about the same card.
const allCards = computed(() =>
  (board.data?.bands || []).flatMap((b) => board.data.columns[b] || []))
const critical = computed(() => allCards.value.filter((c) => c.critical))
const rest = computed(() => allCards.value.filter((c) => !c.critical))
const criticalWhy = computed(() =>
  __('waiting {0} days or more', [5]))

const causeText = computed(() => {
  const d = board.data
  if (!d) return ''
  const parts = []
  if (d.unlinked)
    parts.push(__('{0} of {1} open deals you can see have no correspondence recorded at all',
      [d.unlinked, d.open_total]))
  if (d.unassessable)
    parts.push(__('{0} cannot be read because the direction of the last message is unusable',
      [d.unassessable]))
  return parts.join(__('; ')) + __(', so they cannot appear here. That is not an all-clear.')
})

function open(card) {
  router.push({ name: 'Deal', params: { dealId: card.deal } })
}
</script>
