<template>
  <LayoutHeader>
    <template #left-header>
      <div class="flex items-center gap-2">
        <span class="text-lg font-medium text-ink-gray-8">{{ __('Needs attention') }}</span>
        <!-- ⚠️ REWORDED FROM ALAN'S OWN NOTE, DELIBERATELY. His draft read "cleared by Won, Lost
             or Junk", which teaches the wrong habit: marking a deal Won to empty the list is
             exactly the failure the no-button rule exists to prevent. Replying is what CLEARS an
             item; Won, Lost and Junk REMOVE it, because it has left the pipeline rather than
             because it was dealt with. -->
        <span class="text-xs text-ink-gray-5">
          {{ __('Items clear when you reply. Won, Lost and Junk remove them for good.') }}
        </span>
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
        <!-- ⚠️ IT COUNTS DEALS ONLY WHILE "To go" COUNTS BOTH, so a Lead answered this week is
             counted nowhere. Said on the page rather than left for somebody to discover by
             watching the Lead half never shrink. -->
        <span v-if="performedIsPartial" class="ml-1 text-xs text-ink-gray-4">{{ __('deals only') }}</span>
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
    <!-- ⚠️ THE NATIVE PATTERN, NOT AN INVENTED ONE — rev 4 §3. Alan: *"filters are a human way of
         sorting data to find patterns that are complex and not easily codified"*, and he wants the
         form he already knows from the CRM's list views. The CRM's own `Filter.vue` and
         `SortBy.vue` are bound to a DOCTYPE and to a list resource's params, and this surface is
         neither — it is one endpoint returning an assembled list. So the PATTERN is matched with
         the same primitives those components are built from: `FormControl` fields, a `Button`
         carrying the count, and a `Select` for sort, arranged as the list-view bar arranges them.
         Recorded so nobody re-derives it: reusing the components themselves was tried and is not
         possible without inventing a fake doctype, which would be worse than this. -->
    <!-- One line — Alan's ask. `flex-nowrap` with a scroll rather than wrapping, so a narrow
         window shortens the row instead of stacking it into three. -->
    <div v-if="board.data?.total"
         class="mb-2 flex flex-nowrap items-center gap-2 overflow-x-auto pb-1">
      <FormControl type="text" :placeholder="__('Search name or subject')" v-model="query"
                   :aria-label="__('Search')" class="w-56 shrink-0" />

      <FormControl type="select" v-model="typeFilter" :aria-label="__('Type')" class="shrink-0"
                   :options="[
                     { label: __('Leads and Deals'), value: '' },
                     { label: __('Deals only'), value: 'CRM Deal' },
                     { label: __('Leads only'), value: 'CRM Lead' },
                   ]" />

      <FormControl type="select" v-model="minDays" :aria-label="__('Waiting at least')" class="shrink-0"
                   :options="[
                     { label: __('Any age'), value: 0 },
                     { label: __('2+ days'), value: 2 },
                     { label: __('5+ days'), value: 5 },
                   ]" />

      <!-- §3 — a sort control on days, both ways, in the same form. The DEFAULT is the ruled
           order (§1/§2), and choosing a day sort is an explicit override the label names, so
           nobody is left wondering why the list is not in the order the rules describe. -->
      <FormControl type="select" v-model="sortBy" :aria-label="__('Sort')" class="shrink-0"
                   :options="[
                     { label: __('Sort: as ruled'), value: '' },
                     { label: __('Sort: longest waiting first'), value: 'days_desc' },
                     { label: __('Sort: shortest waiting first'), value: 'days_asc' },
                   ]" />

      <Button v-if="filtering" :label="__('Clear')" variant="ghost" @click="clearFilters" />
    </div>

    <!-- ⚠️ AN ERROR MUST NEVER RENDER AS A BLANK PAGE. There was no error branch at all, so any
         failure — including a user with Lead access but not Deal access, who is refused by the
         endpoint's permission gate — got a header and nothing else. An empty surface reads as an
         all-clear with even less to substantiate it than the green box. -->
    <div v-if="board.error" class="rounded border border-outline-red-2 bg-surface-red-1 p-4 text-sm">
      <div class="font-medium text-ink-red-6">{{ __('This list could not be loaded.') }}</div>
      <div class="mt-1 text-ink-gray-7">
        {{ __('Nothing is being shown, and that is not the same as nothing waiting. If this keeps happening, the deals list may not be shared with you.') }}
      </div>
      <div class="mt-2 text-xs text-ink-gray-5">{{ errorDetail }}</div>
    </div>

    <div v-else-if="board.loading && !board.data" class="text-sm text-ink-gray-5">{{ __('Loading…') }}</div>

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
          {{ __('Either there are no open deals or leads at all, or none of them are yours to see. This list cannot tell the difference, so it is not telling you everything is answered.') }}
        </div>
      </div>
      <div v-else-if="board.data.unlinked || board.data.unassessable"
           class="rounded border border-outline-gray-2 p-4">
        <div class="font-medium text-ink-gray-8">
          {{ __('Nothing to show, and this list cannot yet tell you why.') }}
        </div>
        <div class="mt-1 text-ink-gray-5">{{ causeText }}</div>
      </div>
      <!-- ⚠️ AND A DEGRADED READ CANNOT REACH THE GREEN BOX. A failed Lead read used to delete the
           whole Lead half of the list; if the Deals were all answered the surface then painted the
           all-clear over it. That is the false all-clear returning by a new door. -->
      <div v-else-if="degradedReads.length"
           class="rounded border border-outline-amber-2 bg-surface-amber-1 p-4 text-sm text-ink-gray-8">
        <div class="font-medium">{{ __('Nothing to show, and part of this list could not be read.') }}</div>
        <div class="mt-1">{{ degradedText }}</div>
      </div>
      <div v-else class="rounded border border-outline-green-2 bg-surface-green-1 p-4 text-ink-green-3">
        {{ __('Nothing is waiting. All {0} open deals and leads have been answered.', [board.data.open_total]) }}
      </div>
    </div>

    <!-- ⚠️ CRITICAL VERSUS EVERYTHING ELSE — NOT THREE EQUAL COLUMNS. Rev 3 §3 keeps the single
         stacked list and fixes its DENSITY: rows, a hairline rule, no card treatment. The bands
         still exist in the data and still order the list; they never each get a column, and the
         layout must not be reinstated as columns. -->
    <div v-else-if="board.data" class="flex flex-1 flex-col overflow-y-auto">
      <!-- ⚠️ ONE LIST, IN THE SERVER'S ORDER — AND THIS USED TO BE TWO GROUPS, WHICH REORDERED IT.
           Splitting critical from the rest pulled every critical row to the top, so a stale
           Negotiation the server had placed fourth rendered eighth. That silently overrode the
           ordering ruling of 31 August: stale status first, then status position, then days.
           Critical is still unmistakable — colour, weight, and the word — which is all §8 ever
           asked for; a heading was never the thing carrying the meaning. -->
      <!-- ⚠️ THE HEADER WIDTHS MIRROR `AttentionRow` EXACTLY. Two files describing one grid is a
           drift risk with nothing to catch it, so the suite asserts they match rather than
           trusting it: a header that stops lining up with its column is a defect the reader sees
           before any test does. -->
      <div class="sticky top-0 z-10 flex items-center gap-2 border-b border-outline-gray-2
                  bg-surface-white px-2 py-1 text-xs font-medium text-ink-gray-5"
           data-testid="attention-header">
        <span class="w-[22px] shrink-0"></span>
        <span class="w-44 shrink-0">{{ __('CRM Org.') }}</span>
        <span class="min-w-0 flex-1">{{ __('Subject') }}</span>
        <span class="hidden w-32 shrink-0 lg:block">{{ __('Status') }}</span>
        <span class="hidden w-20 shrink-0 md:block">{{ __('Last By') }}</span>
        <span class="w-28 shrink-0 text-right">{{ __('Age Since Last') }}</span>
        <span class="w-16 shrink-0 text-right">{{ __('Critical') }}</span>
      </div>

      <div v-if="critical.length" class="flex items-baseline gap-2 pb-0.5 pt-1">
        <span class="text-xs font-medium uppercase tracking-wide text-ink-red-6">
          {{ __('{0} critical', [critical.length]) }}
        </span>
        <span class="text-xs text-ink-gray-5">{{ criticalWhy }}</span>
      </div>

      <!-- ⚠️ A FILTER THAT MATCHES NOTHING IS NOT AN ALL-CLEAR EITHER. Without this the list simply
           renders empty under a "To go 0 of 10" heading, which is the same false reassurance the
           three empty-state branches above exist to prevent, arriving by a door they do not cover. -->
      <div v-if="filtering && !shown.length" class="rounded border border-outline-gray-2 p-4 text-sm">
        <div class="font-medium text-ink-gray-8">{{ __('Nothing matches this filter.') }}</div>
        <div class="mt-1 text-ink-gray-5">
          {{ __('{0} records are still waiting — clear the filter to see them.', [stats?.to_go ?? 0]) }}
        </div>
      </div>

      <!-- ⚠️ THE ROW ASKS ONE QUESTION: could the MESSAGE be read? `degraded` was widened from "the
           ages read failed" to "any of three reads failed", and passing the wide flag here made a
           row claim the message could not be read when it was LEADS or the STATUS log that failed
           — inverting the exact error the prop exists to prevent. Found by the second gate pass. -->
      <AttentionRow v-for="card in shown" :key="card.deal" :card="card"
                    :degraded="degradedReads.includes('ages')"
                    :status-unknown="degradedReads.includes('status')" @open="open" />
    </div>

    <!-- ⚠️ WHEN THE AGE QUERY FALLS OVER THE SURFACE SAYS SO. The ages then come from the newest
         message by either side, which on a deal awaiting their decision is OUR last chase — the
         very reading rev 3 §7 replaced. Silence here cost four critical rows in the adversarial
         pass, with nothing on the page to explain why the Critical group had emptied. -->
    <!-- `v-if="degraded && board.data?.total"` — when the list is EMPTY the branch above already
         carries this text, and saying it twice reads as two problems. -->
    <div v-if="degraded && board.data?.total"
         class="mt-2 rounded border border-outline-amber-2 bg-surface-amber-1 p-2 text-xs text-ink-gray-8">
      {{ degradedText }}
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
import { Button, FormControl, createResource } from 'frappe-ui'
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
// A frappe-ui resource may set `messages`, or a plain `Error`, or a string. Rendering the object
// itself prints "{}", which tells the reader less than nothing.
const errorDetail = computed(() => {
  const e = board.error
  if (!e) return ''
  return e.messages?.[0] || e.message || (typeof e === 'string' ? e : __('Unknown error'))
})
const performedIsPartial = computed(() => {
  const covers = board.data?.stats?.performed_covers
  return Array.isArray(covers) && !covers.includes('CRM Lead')
})

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
// ⚠️ THREE READS CAN FAIL AND EACH ONE CHANGES SOMETHING DIFFERENT — what is on the list, what
// order it is in, or how old it looks. The server names which failed; this only says so. An older
// server sends no `degraded` at all, and `age_source` still carries the age half, so both are read.
const degradedReads = computed(() => {
  const d = board.data
  if (!d) return []
  if (Array.isArray(d.degraded)) return d.degraded
  // ⚠️ A MISSING `age_source` IS DEGRADED, NOT HEALTHY. An older server sends neither key, and
  // that is exactly the case where the ages ARE the older kind. Guarding on truthiness here
  // silently made the oldest server the quietest one.
  return d.age_source === 'their_last_message' ? [] : ['ages']
})
const degraded = computed(() => degradedReads.value.length > 0)
const degradedText = computed(() => {
  const say = {
    leads: __('Leads could not be read, so any enquiry waiting for a reply is missing from this list.'),
    status: __('Deal statuses could not be read, so the order is not the usual one and nothing is marked as having an out-of-date status.'),
    ages: __('The customer’s last message could not be read, so ages are measured from the last message either way and no message text is shown. A deal we have chased recently will read as younger than it is.'),
  }
  // An unrecognised key renders as ITSELF rather than as nothing: a newer server
  // naming a read this page has no wording for must still say something.
  return degradedReads.value.map((k) => say[k] || k).join(' ')
})
// §5 — free text across organisation or person AND subject, and a minimum age. They COMPOSE:
// each narrows what the previous one left, which is what "filters compose" means and what the
// "of N" on the counts is measured against.
// ⚠️ ONE AGE FOR THE READER, USED BY EVERY CONTROL THAT MENTIONS AGE. The row renders
// `display_age_days`, which falls back to how long OUR message has been sitting when the contact
// has never written. The filter and the sort were left reading `age_days`, so on three of sixteen
// live rows the column said "4 days" while the age filter and the day sort treated the row as
// having no age at all — a control whose label contradicted the row beneath it. Found at the
// production gate, on CRM-DEAL-2026-00093, the very row that prompted the two-age split.
//
// ⚠️ THE SERVER'S ORDERING IS A DIFFERENT QUESTION AND IS UNTOUCHED. It ranks on `age_days` by
// ruling, because that is time since the CONTACT went quiet. This is the reader's age, and the
// only rule it has to obey is that everything the reader sees agrees with everything else.
const shownAge = (c) => c.display_age_days ?? c.age_days ?? null

const query = ref('')
const minDays = ref(0)
const typeFilter = ref('')
//: ⚠️ SORT IS NOT A FILTER, AND IT IS DELIBERATELY NOT COUNTED AS ONE. Sorting changes the ORDER
//: of what is shown; filtering changes WHAT is shown. Only the second can make a count describe a
//: different set than the list, which is what the "of N" and the "a filter is on" notice exist
//: for. Folding sort into `filtering` would put a notice on the page that says nothing is hidden.
const sortBy = ref('')
const filtering = computed(() =>
  !!query.value.trim() || minDays.value > 0 || !!typeFilter.value)
function clearFilters() {
  query.value = ''
  minDays.value = 0
  typeFilter.value = ''
  sortBy.value = ''
}

const shown = computed(() => {
  const q = query.value.trim().toLowerCase()
  const matched = allCards.value.filter((c) => {
    if (typeFilter.value && c.doctype !== typeFilter.value) return false
    // ⚠️ AN UNKNOWN AGE IS NOT A YOUNG ONE. A row whose age could not be read must not be
    // silently dropped by an age filter that reads `null` as zero — that is the same class of
    // defect as the unbanded rows vanishing from the list.
    if (minDays.value > 0 && !(shownAge(c) === null || shownAge(c) >= minDays.value)) return false
    if (!q) return true
    return `${c.who || ''} ${c.subject || ''}`.toLowerCase().includes(q)
  })
  // ⚠️ THE SERVER'S ORDER IS THE DEFAULT AND SORTING IS AN EXPLICIT OVERRIDE. `sortBy` is empty
  // unless somebody chose a day sort, and the option that does nothing is labelled "as ruled" so
  // the list is never silently in an order the rules do not describe.
  //
  // ⚠️ THE `[...]` IS DEFENSIVE, AND AN EARLIER COMMENT HERE CLAIMED MORE THAN IT DOES. It said
  // the copy stops `sort` reordering `allCards` behind the computed's back. It does not: `matched`
  // is already a fresh array from `.filter()`, so mutating it reaches nothing — mutation proved
  // it, by removing the spread and finding every test still green. The copy stays because the day
  // `matched` stops being a filter result it would become true, and the note is corrected rather
  // than deleted because a justification that overstates itself is how §0.2g happens.
  if (!sortBy.value) return matched
  const dir = sortBy.value === 'days_asc' ? -1 : 1
  return [...matched].sort(
    (a, b) =>
      // An unknown age sorts last WHICHEVER WAY the sort runs — an unknown is not an old thing
      // and it is not a new one either.
      (shownAge(a) === null) - (shownAge(b) === null) ||
      dir * ((shownAge(b) || 0) - (shownAge(a) || 0)),
  )
})

// ⚠️ `critical` COUNTS; IT NO LONGER PARTITIONS. Partitioning was what reordered the list. There
// is deliberately no `rest`: every row renders from `shown`, in the order the server sent it.
const critical = computed(() => shown.value.filter((c) => c.critical))
// The critical group has two reasons now — age, or a status at/beyond the floor — so the label
// names both rather than asserting the age one for rows that are there for the other.
// ⚠️ THE CAPTION NO LONGER EXPLAINS INDIVIDUAL ROWS, BECAUSE IT COULD NOT. It read "5 days or more,
// or far enough along to lose" above a list containing rows at "today" — three production Deals at
// `Ready to Close` and age 0, critical by the second clause exactly as ruled. Neither the rule nor
// the caption was wrong; a disjunction above a list simply cannot tell the reader which half
// applies to the row in front of them. The reason moved onto the row; this just counts.
const criticalWhy = computed(() => __('each row says why'))

const causeText = computed(() => {
  const d = board.data
  if (!d) return ''
  const parts = []
  if (d.unlinked)
    parts.push(__('{0} of {1} open deals and leads you can see have no correspondence recorded at all',
      [d.unlinked, d.open_total]))
  if (d.unassessable)
    parts.push(__('{0} cannot be read because the direction of the last message is unusable',
      [d.unassessable]))
  return parts.join(__('; ')) + __(', so they cannot appear here. That is not an all-clear.')
})

// ⚠️ ROUTE BY TYPE. Every row went to the DEAL route until an adversarial pass caught it — so
// clicking a Lead sent you to `/crm/deals/CRM-LEAD-2026-000xx`, which is nowhere. The round trip
// is Alan's stated acceptance test for this surface, and it was broken for the population he calls
// the failure costing the business most. 171 green tests missed it because the only click test
// used a Deal card.
function open(card) {
  if (card.doctype === 'CRM Lead') {
    router.push({ name: 'Lead', params: { leadId: card.deal } })
  } else {
    router.push({ name: 'Deal', params: { dealId: card.deal } })
  }
}
</script>
