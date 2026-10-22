// Version 1 validation is retained for lossless migration; do not relax its ledger checks.
import { createInventory, ITEM_TYPES, INITIAL_ORDER } from './data.ts'
import type { Item, ItemKind, Order } from './data.ts'
import type { ReturnReport } from './arrivals.ts'
export type LegacyState = Readonly<{
 slots: readonly (Item | null)[]; orders: readonly Order[];
 returnHistory: readonly Readonly<{ items: readonly Item[]; report: ReturnReport }>[];
 orderIndex: number; delivered: Readonly<Partial<Record<ItemKind, number>>>; totalDelivered: number;
 issuedByOrder: Readonly<Partial<Record<string, readonly Item[]>>>; returnedOrderIds: readonly string[];
 pendingIncoming: readonly Item[]; lastReturn: ReturnReport | null;
 selectedId: string | null; moving: boolean; notice: string;
}>

function check(condition: unknown): asserts condition {
  if (!condition) throw new Error('Invalid save')
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function item(value: unknown): asserts value is Item {
  check(record(value) && typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 100
    && typeof value.kind === 'string' && Object.hasOwn(ITEM_TYPES, value.kind))
}
function order(value: unknown): asserts value is Order {
  check(record(value) && typeof value.id === 'string' && typeof value.title === 'string'
    && value.title.length <= 100 && typeof value.message === 'string' && value.message.length <= 300
    && Array.isArray(value.lines) && value.lines.length >= 1 && value.lines.length <= 3)
  const kinds = new Set()
  for (const line of value.lines) {
    check(record(line) && typeof line.kind === 'string' && Object.hasOwn(ITEM_TYPES, line.kind)
      && Number.isInteger(line.quantity) && Number(line.quantity) >= 1 && Number(line.quantity) <= 3 && !kinds.has(line.kind))
    kinds.add(line.kind)
  }
}
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// Validate identities and conservation by replaying only the persisted ledger,
// never rerunning random arrivals. Historical gear may be issued on many days;
// only the live stock/pending/away locations must have unique owners.
export function validateLegacyState(value: unknown): LegacyState {
  check(record(value))
  const s = value as unknown as LegacyState
  check(Array.isArray(s.slots) && s.slots.length === 96 && Array.isArray(s.pendingIncoming)
    && Array.isArray(s.orders) && Number.isSafeInteger(s.orderIndex) && s.orderIndex >= 0
    && s.orders.length === s.orderIndex + 1 && record(s.issuedByOrder)
    && Array.isArray(s.returnHistory) && Array.isArray(s.returnedOrderIds) && record(s.delivered))
  check(s.returnHistory.length === s.orderIndex || s.returnHistory.length === s.orderIndex + 1)
  const expected = new Map(createInventory().filter((i): i is Item => i !== null).map((i) => [i.id, i.kind]))
  let total = 0
  for (const [index, entry] of s.orders.entries()) {
    order(entry)
    check(entry.id === `day-${index + 1}`)
    if (index === 0) check(equal(entry, INITIAL_ORDER))
    const issued = s.issuedByOrder[entry.id] ?? []
    check(Array.isArray(issued))
    const counts: Record<string, number> = {}
    for (const supplied of issued) {
      item(supplied)
      check(expected.get(supplied.id) === supplied.kind)
      expected.delete(supplied.id)
      counts[supplied.kind] = (counts[supplied.kind] ?? 0) + 1
      const requirement = entry.lines.find((line) => line.kind === supplied.kind)
      check(requirement && counts[supplied.kind] <= requirement.quantity)
      total++
    }
    const returned = s.returnHistory[index]
    if (index < s.orderIndex || returned) check(entry.lines.every((line) => counts[line.kind] === line.quantity))
    if (returned) {
      check(record(returned) && record(returned.report) && Array.isArray(returned.items))
      const equipment = issued.filter((i: Item) => ITEM_TYPES[i.kind].category !== '消耗品')
      const report = returned.report as ReturnReport
      check(report.orderId === entry.id && report.equipmentCount === equipment.length
        && report.consumedCount === issued.length - equipment.length
        && Number.isInteger(report.lootCount) && report.lootCount >= 2 && report.lootCount <= 4
        && typeof report.comment === 'string' && report.comment.length <= 300
        && returned.items.length === equipment.length + report.lootCount)
      for (const [position, incoming] of returned.items.entries()) {
        item(incoming)
        if (position < equipment.length) check(equal(incoming, equipment[position]))
        else check(incoming.id === `loot-${entry.id}-${position - equipment.length + 1}`)
        check(!expected.has(incoming.id))
        expected.set(incoming.id, incoming.kind)
      }
    }
    if (index === s.orderIndex) {
      check(Object.entries(s.delivered).every(([kind, count]) => counts[kind] === count))
      check(Object.entries(counts).every(([kind, count]) => s.delivered[kind as keyof typeof s.delivered] === count))
    }
  }
  const orderIds = new Set(s.orders.map((o) => o.id))
  check(Object.keys(s.issuedByOrder).every((id) => orderIds.has(id)))
  check(s.totalDelivered === total && equal(s.returnedOrderIds, s.returnHistory.map((r) => r.report.orderId)))
  check(equal(s.lastReturn, s.returnHistory.at(-1)?.report ?? null))
  for (const live of [...s.slots, ...s.pendingIncoming]) {
    if (live === null) continue
    item(live)
    check(expected.get(live.id) === live.kind)
    expected.delete(live.id)
  }
  // Pending entries cannot be empty, and no item may disappear or be duplicated.
  check(s.pendingIncoming.every((i) => i !== null) && expected.size === 0)
  return { ...s, selectedId: null, moving: false, notice: '倉庫の記録を復元しました。続きから遊べます。' }
}
