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

  <div class="flex h-full flex-col overflow-hidden px-4 py-3">
    <!-- §6 — the size of the task. `to_clear` is `performed + to_go` server-side, so these three
         cannot disagree on the page. Nothing is marked done by hand: an item leaves because
         someone replied. -->
    <div v-if="stats" class="mb-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
      <div><span class="text-ink-gray-5">{{ __('To clear') }}</span>
        <span class="ml-1.5 font-medium text-ink-gray-8">{{ stats.to_clear ?? '—' }}</span></div>
      <!-- ⚠️ THE LABEL SAYS WHAT IT COUNTS. "Performed" alone reads as work done, and this counts
           work done that LEFT THE LIST — the same rule the surface lives by. Reply to a deal
           awaiting the customer's decision and you have answered them, but the deal stays on the
           list as a chase and does not move this number. Named rather than left to be discovered. -->
      <div><span class="text-ink-gray-5">{{ __('Performed') }}</span>
        <span class="ml-1.5 font-medium text-ink-gray-8">{{ stats.performed ?? '—' }}</span>
        <span class="ml-1 text-xs text-ink-gray-4">{{ __('answered and off the list') }}</span>
        <!-- ⚠️ THE PERIOD IS ON THE PAGE, NOT ONLY IN THE CODE. A count whose window is invisible
             is a count nobody can check. Rev 3 §6: a rolling week, so Monday does not open on a
             blank. -->
        <!-- ⚠️ THE PERIOD IS NAMED FROM THE PERIOD ACTUALLY USED. `days` used to be a constant, so
             a custom `since` produced an all-time count under a "last 7 days" heading. -->
        <span class="ml-1 text-xs text-ink-gray-4">{{ stats.days
          ? __('last {0} days', [stats.days]) : __('since {0}', [stats.since]) }}</span></div>
      <!-- ⚠️ A COUNT MUST DESCRIBE THE LIST UNDERNEATH IT. With a filter on, `To go` and `Critical`
           are the FILTERED numbers and say "of N" so the whole is still visible. `To clear` and
           `Performed` cannot be filtered — a deal that was answered is not on the list to match a
           search — so they are labelled as covering everything rather than silently describing a
           different set, which is the shape of defect this estate keeps producing. -->
      <div><span class="text-ink-gray-5">{{ __('To go') }}</span>
        <span data-testid="count-to-go"
              class="ml-1.5 font-medium text-ink-gray-8">{{ filtering ? shown.length : stats.to_go }}</span>
        <span v-if="filtering" class="ml-1 text-xs text-ink-gray-4">{{ __('of {0}', [stats.to_go]) }}</span></div>
      <!-- §8 — colour carries emphasis, never meaning on its own, so the count says "critical"
           in words too. -->
      <div v-if="board.data?.critical">
        <span class="text-ink-red-6">{{ __('Critical') }}</span>
        <span data-testid="count-critical"
              class="ml-1.5 font-medium text-ink-red-6">{{ filtering ? critical.length : board.data.critical }}</span>
        <span v-if="filtering" class="ml-1 text-xs text-ink-gray-4">{{ __('of {0}', [board.data.critical]) }}</span>
      </div>
      <div v-if="filtering" class="text-xs text-ink-gray-4">
        {{ __('A filter is on. “To clear” and “Performed” still cover the whole list.') }}
      </div>
    </div>

    <!-- §5 — AT 50 ITEMS SCROLLING IS NOT NAVIGATION. Filtering happens here rather than on the
         server on purpose: the whole list is already loaded, it is tens of rows and not thousands,
         and a round trip per keystroke would make the surface feel slower than the scrolling it
         replaces. If the list ever outgrows that, the filter moves to `get_attention` — and the
         counts move with it. -->
    <div v-if="board.data?.total" class="mb-2 flex flex-wrap items-center gap-2 text-sm">
      <input v-model="query" type="search" class="w-64 rounded border border-outline-gray-2 px-2 py-1 text-sm"
             :placeholder="__('Search organisation, person or subject')" :aria-label="__('Search')" />
      <select v-model="minDays" class="rounded border border-outline-gray-2 px-2 py-1 text-sm"
              :aria-label="__('Waiting at least')">
        <option :value="0">{{ __('Any age') }}</option>
        <option :value="2">{{ __('2+ days') }}</option>
        <option :value="5">{{ __('5+ days') }}</option>
      </select>
      <button v-if="filtering" class="text-xs text-ink-gray-5 underline" @click="clearFilters">
        {{ __('Clear filters') }}
      </button>
      <!-- ⚠️ §4 IS A REPORT, NOT A FILTER, so there is no type control yet and the absence is
           stated rather than left as a gap. Leads carry correspondence by both link routes, but
           0 of 20 open production Leads have any reply recorded — the outbound-capture gap — so a
           combined list would report almost every enquiry as unanswered. -->
      <span class="text-xs text-ink-gray-4">{{ __('Deals only — Leads are with the architect') }}</span>
    </div>

    <div v-if="board.loading && !board.data" class="text-sm text-ink-gray-5">{{ __('Loading…') }}</div>

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

    <!-- ⚠️ CRITICAL VERSUS EVERYTHING ELSE — NOT THREE EQUAL COLUMNS. Rev 3 §3 keeps the single
         stacked list and fixes its DENSITY: rows, a hairline rule, no card treatment. The bands
         still exist in the data and still order the list; they never each get a column, and the
         layout must not be reinstated as columns. -->
    <div v-else-if="board.data" class="flex flex-1 flex-col overflow-y-auto">
      <template v-if="critical.length">
        <div class="flex items-baseline gap-2 pb-0.5 pt-1">
          <span class="text-xs font-medium uppercase tracking-wide text-ink-red-6">{{ __('Critical') }}</span>
          <span class="text-xs text-ink-gray-5">{{ criticalWhy }}</span>
        </div>
        <AttentionRow v-for="card in critical" :key="card.deal" :card="card"
                      :degraded="degraded" @open="open" />
      </template>

      <!-- ⚠️ A FILTER THAT MATCHES NOTHING IS NOT AN ALL-CLEAR EITHER. Without this the list simply
           renders empty under a "To go 0 of 10" heading, which is the same false reassurance the
           three empty-state branches above exist to prevent, arriving by a door they do not cover. -->
      <div v-if="filtering && !shown.length" class="rounded border border-outline-gray-2 p-4 text-sm">
        <div class="font-medium text-ink-gray-8">{{ __('Nothing matches this filter.') }}</div>
        <div class="mt-1 text-ink-gray-5">
          {{ __('{0} deals are still waiting — clear the filter to see them.', [stats?.to_go ?? 0]) }}
        </div>
      </div>

      <template v-if="rest.length">
        <div class="flex items-baseline gap-2 pb-0.5 pt-3">
          <span class="text-xs font-medium uppercase tracking-wide text-ink-gray-5">
            {{ critical.length ? __('Everything else') : __('Waiting') }}
          </span>
          <span class="text-xs text-ink-gray-4">{{ rest.length }}</span>
        </div>
        <AttentionRow v-for="card in rest" :key="card.deal" :card="card"
                      :degraded="degraded" @open="open" />
      </template>
    </div>

    <!-- ⚠️ WHEN THE AGE QUERY FALLS OVER THE SURFACE SAYS SO. The ages then come from the newest
         message by either side, which on a deal awaiting their decision is OUR last chase — the
         very reading rev 3 §7 replaced. Silence here cost four critical rows in the adversarial
         pass, with nothing on the page to explain why the Critical group had emptied. -->
    <div v-if="degraded"
         class="mt-2 rounded border border-outline-amber-2 bg-surface-amber-1 p-2 text-xs text-ink-amber-3">
      {{ __('The customer’s last message could not be read just now, so ages are measured from the last message either way and no message text is shown. A deal we have chased recently will read as younger than it is.') }}
    </div>

    <div v-if="board.data?.unlinked || board.data?.unassessable"
         class="mt-2 rounded border border-outline-amber-2 bg-surface-amber-1 p-2 text-xs text-ink-amber-3">
      {{ causeText }}
    </div>
  </div>
</template>

<script setup>
/**
 * "Needs attention" — the working surface.
 *
 * ⚠️ IT IS A CRM ROUTE, NOT A DESK PAGE, AND THAT IS §1 OF `CC-BRIEF-ATTENTION-V2`. Alan's ask was
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
 * the states, the bands, the ages and the critical rule, and this file only renders what it is
 * given. The `critical` flag is READ, never re-derived from the band name — otherwise the colour
 * and the words could disagree.
 */
import { computed, ref, onActivated, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Button, createResource } from 'frappe-ui'
import LayoutHeader from '@/components/LayoutHeader.vue'
import AttentionRow from '@/components/AttentionRow.vue'

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

// ⚠️ `cards` IS THE SERVER'S OWN ORDERED LIST AND THIS PAGE NEVER RE-SORTS IT. The order is
// Alan's final ordering ruling of 31 August: Deals by CRM Deal Status position, days secondary
// WITHIN a status. Sorting here as well would be a second copy of a rule that has already been
// changed three times in one day. THIS PAGE NO LONGER FLATTENS THE BANDS ITSELF, either. It used to, and a row whose age could not be read has no band, so it counted
// towards `total` and appeared nowhere: on the size of the task and off the list. These two only
// PARTITION `cards`; they never re-sort it and never re-derive `critical` from the band name, or
// the colour and the words could disagree about the same row.
const allCards = computed(() => {
  const d = board.data
  if (!d) return []
  // ⚠️ THE FALLBACK IS FOR VERSION SKEW BETWEEN TWO SEPARATELY DEPLOYED APPS, and without it the
  // failure was silent. `cards` is served by `lc_winnow`; this page ships in the CRM. If the CRM
  // lands first, `cards` is undefined while `total` is 10 — so no empty-state branch fires either
  // — and the page renders "To go 10" above nothing at all, with no explanation. Falling back to
  // the bands loses a row whose age could not be read, which is the lesser of the two failures
  // and lasts only until the other app deploys.
  if (Array.isArray(d.cards)) return d.cards
  // ⚠️ AND THE FALLBACK MUST NOT REORDER THE LIST. `bands` is youngest-first, so flattening them
  // put a one-day row above three-day rows — the surface's one ordering rule, oldest first,
  // silently inverted on exactly the path nobody would be watching. Sorted the way the server
  // sorts: oldest first, unknown ages last.
  return (d.bands || []).flatMap((b) => d.columns?.[b] || [])
    .sort((a, b) => (a.age_days === null) - (b.age_days === null) || b.age_days - a.age_days)
})

// ⚠️ ANYTHING THAT IS NOT THE GOOD ANSWER IS THE DEGRADED ONE, including `undefined` — which is
// what an older server sends, and is precisely the case where the ages ARE the older kind. A test
// for equality with the failure string left the banner silent in the one situation it exists for.
const degraded = computed(() =>
  !!board.data && board.data.age_source !== 'their_last_message')
// §5 — free text across organisation or person AND subject, and a minimum age. They COMPOSE:
// each narrows what the previous one left, which is what "filters compose" means and what the
// "of N" on the counts is measured against.
const query = ref('')
const minDays = ref(0)
const filtering = computed(() => !!query.value.trim() || minDays.value > 0)
function clearFilters() {
  query.value = ''
  minDays.value = 0
}

const shown = computed(() => {
  const q = query.value.trim().toLowerCase()
  return allCards.value.filter((c) => {
    // ⚠️ AN UNKNOWN AGE IS NOT A YOUNG ONE. A row whose age could not be read must not be
    // silently dropped by an age filter that reads `null` as zero — that is the same class of
    // defect as the unbanded rows vanishing from the list.
    if (minDays.value > 0 && !(c.age_days === null || c.age_days >= minDays.value)) return false
    if (!q) return true
    return `${c.who || ''} ${c.subject || ''}`.toLowerCase().includes(q)
  })
})

const critical = computed(() => shown.value.filter((c) => c.critical))
const rest = computed(() => shown.value.filter((c) => !c.critical))
// The critical group has two reasons now — age, or a status at/beyond the floor — so the label
// names both rather than asserting the age one for rows that are there for the other.
const criticalWhy = computed(() =>
  __('not heard from in {0} days or more, or far enough along to lose', [5]))

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
