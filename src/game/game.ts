import { createInventory, INITIAL_ITEM_COUNT, ITEM_TYPES } from './data.ts'
import type { Item } from './data.ts'
import { createReturnBatch, placeIncoming } from './arrivals.ts'
import type { LegacyState } from './legacy.ts'

export const HERO_CAPACITY = 8
export type Area = 'warehouse' | 'hero'
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
  pendingIncoming: readonly Item[]
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
    adventures: [createAdventure(1)], pendingIncoming: [], legacy: null, selection: null, moving: false,
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
  if (!at || !['warehouse', 'hero'].includes(at.area) || !Number.isInteger(at.slot)) return null
  return (at.area === 'warehouse' ? s.slots : s.heroSlots)[at.slot] ?? null
}
export function getSelectedItem(s: GameState) {
  return s.selection && itemAt(s, s.selection.at)?.id === s.selection.itemId ? itemAt(s, s.selection.at) : null
}
const same = (a: Location, b: Location) => a.area === b.area && a.slot === b.slot
const valid = (s: GameState, at: Location) => at && ['warehouse', 'hero'].includes(at.area)
  && Number.isInteger(at.slot) && at.slot >= 0 && at.slot < (at.area === 'warehouse' ? s.slots.length : s.heroSlots.length)
export function canTransfer(s: GameState, from: Location, to: Location, itemId: string, adventureId: string): boolean {
  return adventureId === currentAdventure(s).id && !!valid(s, from) && !!valid(s, to) && !same(from, to)
    && itemAt(s, from)?.id === itemId
    && (from.area !== 'hero' && to.area !== 'hero' || (!currentAdventure(s).timing && !hasReturned(s)))
}
function transfer(s: GameState, from: Location, to: Location, itemId: string, adventureId: string): GameState {
  if (!canTransfer(s, from, to, itemId, adventureId)) return s
  const slots = [...s.slots], heroSlots = [...s.heroSlots]
  const origin = from.area === 'warehouse' ? slots : heroSlots
  const target = to.area === 'warehouse' ? slots : heroSlots
  const occupied = target[to.slot] !== null
  ;[origin[from.slot], target[to.slot]] = [target[to.slot], origin[from.slot]]
  return { ...s, slots, heroSlots, selection: null, moving: false,
    notice: occupied ? 'ふたつの品を交換しました。' : to.area === 'hero' ? '勇者の持ち物に準備しました。出発前なら戻せます。' : '倉庫の空き枠へ移動しました。' }
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
      return getSelectedItem(s) && (s.selection!.at.area === 'warehouse' || phase(s, 0) === 'preparing')
        ? { ...s, moving: true, notice: '移動先をタップ。品があれば交換します。勇者の枠にも移せます。' } : s
    case 'cancel': return { ...s, selection: null, moving: false, notice: '選択を解除しました。' }
    case 'transfer': return transfer(s, action.from, action.to, action.itemId, action.adventureId)
    case 'depart': {
      if (action.adventureId !== a.id || phase(s, action.now) !== 'preparing'
        || !Number.isSafeInteger(action.now) || action.now < 0 || action.now > Number.MAX_SAFE_INTEGER - 180000) return s
      const durationMs = (60 + ((action.seed >>> 0) % 121)) * 1000
      const timing = { startedAt: action.now, durationMs, returnAt: action.now + durationMs }
      return { ...s, adventures: updateAdventure(s, { ...a, issued: s.heroSlots.filter((i): i is Item => i !== null), timing }),
        selection: null, moving: false, notice: '勇者が冒険へ出発しました。留守の間も倉庫を整理できます。' }
    }
    case 'return': {
      if (action.adventureId !== a.id || !Number.isSafeInteger(action.now) || phase(s, action.now) !== 'ready') return s
      const batch = createReturnBatch(a.id, a.issued, action.seed)
      const incoming = placeIncoming(s.slots, [...s.pendingIncoming, ...batch.items], action.seed)
      return { ...s, slots: incoming.slots, pendingIncoming: incoming.pendingIncoming,
        heroSlots: Array(HERO_CAPACITY).fill(null), adventures: updateAdventure(s, { ...a, returned: batch }),
        selection: null, moving: false,
        notice: `勇者が帰還。${incoming.placed}個を入庫しました。受取待ちは${incoming.pendingIncoming.length}個です。` }
    }
    case 'next':
      if (action.adventureId !== a.id || !hasReturned(s)) return s
      return { ...s, day: s.day + 1, adventures: [...s.adventures, createAdventure(s.day + 1)], selection: null, moving: false,
        notice: '翌日になりました。倉庫の配置はそのまま。今日の冒険の支度をしましょう。' }
    case 'receive': {
      if (!s.pendingIncoming.length) return s
      const incoming = placeIncoming(s.slots, s.pendingIncoming, action.seed)
      return { ...s, slots: incoming.slots, pendingIncoming: incoming.pendingIncoming, selection: null, moving: false,
        notice: incoming.placed ? `${incoming.placed}個を入庫しました。` : '空き枠がありません。受取待ちの品は保管しています。' }
    }
    case 'reset': return createGame()
  }
}
