import { createInventory, INITIAL_ITEM_COUNT, ITEM_TYPES } from './data.ts'
import type { Item } from './data.ts'
import { createReturnBatch, placeIncoming } from './arrivals.ts'
import type { LegacyState } from './legacy.ts'

export const HERO_CAPACITY = 8
export type Area = 'warehouse' | 'hero' | 'sorting'
export type Location = Readonly<{ area: Area; slot: number }>
export type ReturnBatch = ReturnType<typeof createReturnBatch>
export type Adventure = Readonly<{
  id: string; title: string; message: string
  issued: readonly Item[]
  timing: Readonly<{ startedAt: number; durationMs: number; returnAt: number }> | null
  returned: ReturnBatch | null
}>
export type GameState = Readonly<{
  initialItemCount: 48 | 96
  slots: readonly (Item | null)[]
  heroSlots: readonly (Item | null)[]
  day: number
  adventures: readonly Adventure[]
  // Hero-owned overflow, kept out of the expedition; retains the legacy save field.
  pendingIncoming: readonly Item[]
  // Persistent intake choices, separate from transient item inspection.
  intakeSelection: readonly string[]
  legacy: LegacyState | null
  selection: Readonly<{ itemId: string; at: Location }> | null
  moving: boolean
  notice: string
}>
export type GameAction =
  | { type: 'select'; at: Location }
  | { type: 'move' } | { type: 'cancel' }
  | { type: 'transfer'; from: Location; to: Location; itemId: string; adventureId: string }
  | { type: 'depart'; adventureId: string; now: number; seed: number }
  | { type: 'return'; adventureId: string; now: number; seed: number }
  | { type: 'next'; adventureId: string }
  | { type: 'receive'; seed: number }
  | { type: 'intake-toggle'; itemId: string }
  | { type: 'quick'; from: Location; itemId: string; adventureId: string }
  | { type: 'reset' }

const plans = [
  { title: '街道の見回り', message: '今日は村の先の街道を見てくるよ。持っていく道具は任せた！' },
  { title: '森での採集', message: '森へ素材を探しに行くよ。使えそうな品を選んでくれるかな？' },
  { title: '山道の探索', message: '今日は山道の様子を見てくる。荷物の準備を頼むね。' },
] as const
export function createAdventure(day: number): Adventure {
  return { id: `day-${day}`, ...plans[(day - 1) % plans.length], issued: [], timing: null, returned: null }
}
export function createGame(): GameState {
  return { initialItemCount: INITIAL_ITEM_COUNT, slots: createInventory(), heroSlots: Array(HERO_CAPACITY).fill(null), day: 1,
    adventures: [createAdventure(1)], pendingIncoming: [], intakeSelection: [], legacy: null, selection: null, moving: false,
    notice: 'ドラッグで移動・交換。タップでも品を選んで支給・整理できます。' }
}
export const currentAdventure = (s: GameState) => s.adventures[s.adventures.length - 1]
export function inheritedReturn(s: GameState, adventure: Adventure): boolean {
  return !!s.legacy && adventure.id === `day-${s.legacy.orderIndex + 1}`
    && s.legacy.returnedOrderIds.includes(adventure.id)
}
export function hasReturned(s: GameState, a = currentAdventure(s)): boolean {
  return a.returned !== null || inheritedReturn(s, a)
}
export function phase(s: GameState, now: number) {
  const a = currentAdventure(s)
  if (hasReturned(s, a)) return 'returned'
  if (!a.timing) return 'preparing'
  return now >= a.timing.returnAt ? 'ready' : 'away'
}
export function itemAt(s: GameState, at: Location): Item | null {
  if (!at || !['warehouse', 'hero', 'sorting'].includes(at.area) || !Number.isInteger(at.slot)) return null
  return (at.area === 'warehouse' ? s.slots : at.area === 'hero' ? s.heroSlots : s.pendingIncoming)[at.slot] ?? null
}
export function getSelectedItem(s: GameState) {
  return s.selection && itemAt(s, s.selection.at)?.id === s.selection.itemId ? itemAt(s, s.selection.at) : null
}
const same = (a: Location, b: Location) => a.area === b.area && a.slot === b.slot
const valid = (s: GameState, at: Location) => at && ['warehouse', 'hero', 'sorting'].includes(at.area)
  && Number.isInteger(at.slot) && at.slot >= 0 && at.slot < (at.area === 'warehouse' ? s.slots.length : at.area === 'hero' ? s.heroSlots.length : s.pendingIncoming.length)
export function transferProblem(s: GameState, from: Location, to: Location, itemId: string, adventureId: string): string | null {
  if (adventureId !== currentAdventure(s).id || !valid(s, from) || itemAt(s, from)?.id !== itemId) return '持ち物が変わりました。もう一度選んでください。'
  if ((from.area === 'hero' || to.area === 'hero') && currentAdventure(s).timing && !hasReturned(s)) return '冒険中の持ち物は変更できません。'
  if (!valid(s, to)) return to.area === 'hero' ? '勇者の持ち物に空きがありません。' : '倉庫に空きがありません。空きを作ってから戻せます。'
  if (same(from, to)) return '元の枠です。移動を取り消しました。'
  if (from.area !== to.area && itemAt(s, to)) return '移動先は空き枠を選んでください。倉庫内では交換できます。'
  return null
}
export function canTransfer(s: GameState, from: Location, to: Location, itemId: string, adventureId: string): boolean {
  return transferProblem(s, from, to, itemId, adventureId) === null
}
function transfer(s: GameState, from: Location, to: Location, itemId: string, adventureId: string): GameState {
  const problem = transferProblem(s, from, to, itemId, adventureId)
  if (problem) return { ...s, notice: problem }
  const slots = [...s.slots], heroSlots = [...s.heroSlots], pending = [...s.pendingIncoming] as (Item | null)[]
  const list = (area: Area) => area === 'warehouse' ? slots : area === 'hero' ? heroSlots : pending
  const origin = list(from.area), target = list(to.area)
  const occupied = target[to.slot] !== null
  ;[origin[from.slot], target[to.slot]] = [target[to.slot], origin[from.slot]]
  return { ...s, slots, heroSlots, pendingIncoming: pending.filter((i): i is Item => i !== null),
    intakeSelection: s.intakeSelection.filter((id) => id !== itemId), selection: null, moving: false,
    notice: occupied ? 'ふたつの品を交換しました。' : to.area === 'hero' ? '勇者の持ち物へ移しました。' : '選んだ品を倉庫へ戻しました。' }
}
function updateAdventure(s: GameState, adventure: Adventure): readonly Adventure[] {
  return [...s.adventures.slice(0, -1), adventure]
}
export function gameReducer(s: GameState, action: GameAction): GameState {
  const a = currentAdventure(s)
  switch (action.type) {
    case 'select': {
      if (!valid(s, action.at)) return s
      if (s.moving && s.selection) {
        if (same(s.selection.at, action.at)) return { ...s, moving: false, notice: '移動をキャンセルしました。' }
        return transfer(s, s.selection.at, action.at, s.selection.itemId, a.id)
      }
      const item = itemAt(s, action.at)
      if (!item) return { ...s, notice: '空き枠です。品を選び「移動・交換」から移せます。' }
      const deselect = s.selection && same(s.selection.at, action.at) && s.selection.itemId === item.id
      return { ...s, selection: deselect ? null : { itemId: item.id, at: action.at }, moving: false,
        notice: deselect ? '選択を解除しました。' : `${ITEM_TYPES[item.kind].name}を選択。「移動・交換」で移動先を選べます。` }
    }
    case 'move':
      return getSelectedItem(s) && (s.selection!.at.area !== 'hero' || (!a.timing || hasReturned(s)))
        ? { ...s, moving: true, notice: '移動先をタップ。品があれば交換します。勇者の枠にも移せます。' } : s
    case 'cancel': return { ...s, selection: null, moving: false, notice: '選択を解除しました。' }
    case 'quick': {
      const to: Location = action.from.area === 'warehouse'
        ? { area: 'hero', slot: s.heroSlots.indexOf(null) } : { area: 'warehouse', slot: s.slots.indexOf(null) }
      return transfer(s, action.from, to, action.itemId, action.adventureId)
    }
    case 'intake-toggle': {
      const candidates = [...s.heroSlots, ...s.pendingIncoming]
      if (!hasReturned(s) || !candidates.some((i) => i?.id === action.itemId)) return s
      return { ...s, intakeSelection: s.intakeSelection.includes(action.itemId)
        ? s.intakeSelection.filter((id) => id !== action.itemId) : [...s.intakeSelection, action.itemId] }
    }
    case 'transfer': return transfer(s, action.from, action.to, action.itemId, action.adventureId)
    case 'depart': {
      if (action.adventureId !== a.id || phase(s, action.now) !== 'preparing'
        || !Number.isSafeInteger(action.now) || action.now < 0 || action.now > Number.MAX_SAFE_INTEGER - 180000) return s
      const durationMs = (60 + ((action.seed >>> 0) % 121)) * 1000
      const timing = { startedAt: action.now, durationMs, returnAt: action.now + durationMs }
      return { ...s, adventures: updateAdventure(s, { ...a, issued: s.heroSlots.filter((i): i is Item => i !== null), timing }),
        intakeSelection: [], selection: null, moving: false, notice: '勇者が冒険へ出発しました。留守の間も倉庫を整理できます。' }
    }
    case 'return': {
      if (action.adventureId !== a.id || !Number.isSafeInteger(action.now) || phase(s, action.now) !== 'ready') return s
      const batch = createReturnBatch(a.id, a.issued, action.seed)
      return { ...s, pendingIncoming: [...s.pendingIncoming, ...batch.items.slice(HERO_CAPACITY)],
        heroSlots: Array.from({ length: HERO_CAPACITY }, (_, i) => batch.items[i] ?? null),
        adventures: updateAdventure(s, { ...a, returned: batch }), intakeSelection: [], selection: null, moving: false,
        notice: '勇者が帰還。入庫する品を選んでください。残りは勇者が持ち越します。' }
    }
    case 'next':
      if (action.adventureId !== a.id || !hasReturned(s)) return s
      return { ...s, day: s.day + 1, adventures: [...s.adventures, createAdventure(s.day + 1)], intakeSelection: [], selection: null, moving: false,
        notice: '翌日になりました。倉庫の配置はそのまま。今日の冒険の支度をしましょう。' }
    case 'receive': {
      if (!hasReturned(s) || !s.intakeSelection.length) return s
      const ids = new Set(s.intakeSelection)
      const items = [...s.heroSlots, ...s.pendingIncoming].filter((i): i is Item => i !== null && ids.has(i.id))
      if (items.length !== ids.size) return s
      if (items.length > s.slots.filter((i) => i === null).length) return { ...s, notice: '倉庫の空きが足りません。選択数を減らすか空きを作ってください。' }
      const incoming = placeIncoming(s.slots, items, action.seed)
      return { ...s, slots: incoming.slots, heroSlots: s.heroSlots.map((i) => i && ids.has(i.id) ? null : i),
        pendingIncoming: s.pendingIncoming.filter((i) => !ids.has(i.id)), intakeSelection: [], selection: null, moving: false,
        notice: `${items.length}個を入庫しました。残りは勇者に保持しています。` }
    }
    case 'reset': return createGame()
  }
}
