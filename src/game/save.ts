import { createInventory, createLegacyInventory, ITEM_TYPES, WAREHOUSE_CAPACITY } from './data.ts'
import type { Item } from './data.ts'
import { createGame, createAdventure, currentAdventure, HERO_CAPACITY, inheritedReturn } from './game.ts'
import type { GameState, Adventure, ReturnBatch } from './game.ts'
import { validateLegacyState } from './legacy.ts'
import type { LegacyState } from './legacy.ts'

export const SAVE_KEY = 'guild-keeper.save'
export const SAVE_BACKUP_KEY = 'guild-keeper.save.v1-backup'
export const SAVE_VERSION = 4
export type SaveStorage = Pick<Storage, 'getItem' | 'setItem'>
export type LoadedGame = { state: GameState; blocked: boolean; message: string }
function check(condition: unknown): asserts condition { if (!condition) throw new Error('Invalid save') }
function object(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object' && !Array.isArray(v) }
function item(v: unknown): asserts v is Item {
  check(object(v) && typeof v.id === 'string' && v.id.length > 0 && v.id.length <= 100
    && typeof v.kind === 'string' && Object.hasOwn(ITEM_TYPES, v.kind))
}
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
export function legacyOwned(s: LegacyState): readonly Item[] {
  const id = s.orders[s.orderIndex].id
  return [...s.slots.filter((i): i is Item => i !== null), ...s.pendingIncoming,
    ...(s.returnedOrderIds.includes(id) ? [] : s.issuedByOrder[id] ?? [])]
}
export function migrateLegacy(value: unknown): GameState {
  const legacy = validateLegacyState(value)
  const day = legacy.orderIndex + 1
  const a = createAdventure(day)
  const issued = legacy.returnedOrderIds.includes(a.id) ? [] : legacy.issuedByOrder[a.id] ?? []
  return { ...createGame(), initialItemCount: 96, slots: [...legacy.slots, ...Array(WAREHOUSE_CAPACITY - legacy.slots.length).fill(null)], day, adventures: [a], legacy,
    heroSlots: Array.from({ length: HERO_CAPACITY }, (_, i) => issued[i] ?? null),
    pendingIncoming: [...legacy.pendingIncoming, ...issued.slice(HERO_CAPACITY)],
    notice: issued.length ? '旧記録を移行しました。未帰還の支給品は準備欄へ戻しました。持ち物を確認して出発できます。'
      : '旧記録の配置・受取待ち・履歴を移行しました。' }
}
// Reconstruct expected ownership from the initial stock / validated v1 baseline.
// Historical entries are records, not a second physical inventory.
export function validateState(value: unknown, version: 2 | 3 | 4 = 4): GameState {
  check(object(value))
  const s = value as unknown as GameState
  check(Array.isArray(s.slots) && s.slots.length === (version === 2 ? 96 : WAREHOUSE_CAPACITY) && Array.isArray(s.heroSlots) && s.heroSlots.length === HERO_CAPACITY
    && Array.isArray(s.pendingIncoming) && Array.isArray(s.adventures) && s.adventures.length > 0
    && Number.isSafeInteger(s.day) && s.day >= 1)
  const initialItemCount = version === 2 ? 96 : s.initialItemCount
  check(initialItemCount === 48 || initialItemCount === 96)
  const legacy = s.legacy === null ? null : validateLegacyState(s.legacy)
  if (legacy) check(initialItemCount === 96)
  const baseDay = legacy ? legacy.orderIndex + 1 : 1
  check(s.day === baseDay + s.adventures.length - 1)
  const baseline = legacy ? legacyOwned(legacy) : (initialItemCount === 96 ? createLegacyInventory() : createInventory()).filter((i): i is Item => i !== null)
  const expected = new Map(baseline.map((i) => [i.id, i.kind]))
  check(expected.size === baseline.length)
  for (const [index, entry] of s.adventures.entries()) {
    check(object(entry))
    const a = entry as unknown as Adventure
    check( a.id === `day-${baseDay + index}` && typeof a.title === 'string' && a.title.length <= 100
      && typeof a.message === 'string' && a.message.length <= 300 && Array.isArray(a.issued) && a.issued.length <= HERO_CAPACITY)
    const inherited = inheritedReturn({ ...s, legacy }, a)
    if (a.timing === null) check(a.returned === null && a.issued.length === 0)
    else {
      check(object(a.timing))
      const t = a.timing as NonNullable<Adventure['timing']>
      check( Number.isSafeInteger(t.startedAt) && t.startedAt >= 0 && Number.isSafeInteger(t.durationMs)
        && t.durationMs >= 60000 && t.durationMs <= 180000 && t.durationMs % 1000 === 0
        && Number.isSafeInteger(t.returnAt) && t.returnAt === t.startedAt + t.durationMs && !inherited)
      for (const supplied of a.issued) {
        item(supplied); check(expected.get(supplied.id) === supplied.kind); expected.delete(supplied.id)
      }
    }
    if (a.returned !== null) {
      check(a.timing !== null && object(a.returned) && object(a.returned.report) && Array.isArray(a.returned.items))
      const equipment = a.issued.filter((i: Item) => ITEM_TYPES[i.kind].category !== '消耗品')
      const r = (a.returned as ReturnBatch).report
      check(r.orderId === a.id && r.equipmentCount === equipment.length && r.consumedCount === a.issued.length - equipment.length
        && Number.isInteger(r.lootCount) && r.lootCount >= 2 && r.lootCount <= 4
        && typeof r.comment === 'string' && r.comment.length <= 300 && a.returned.items.length === equipment.length + r.lootCount)
      for (const [n, incoming] of a.returned.items.entries()) {
        item(incoming)
        check(n < equipment.length ? equal(incoming, equipment[n]) : incoming.id === `loot-${a.id}-${n - equipment.length + 1}`)
        check(!expected.has(incoming.id)); expected.set(incoming.id, incoming.kind)
      }
    }
    if (index < s.adventures.length - 1) check(a.returned !== null || inherited)
  }
  const a = currentAdventure(s)
  const hero = s.heroSlots.filter((i) => i !== null)
  if (a.timing && !a.returned) {
    check(equal(hero, a.issued))
    for (const i of a.issued) { check(!expected.has(i.id)); expected.set(i.id, i.kind) }
  } else if (version < 4 && (a.returned || inheritedReturn({ ...s, legacy }, a))) check(hero.length === 0)
  for (const live of [...s.slots, ...s.heroSlots, ...s.pendingIncoming]) {
    if (live === null) continue
    item(live); check(expected.get(live.id) === live.kind); expected.delete(live.id)
  }
  check(expected.size === 0 && s.pendingIncoming.every((i) => i !== null))
  const intakeSelection = version < 4 ? [] : s.intakeSelection
  check(Array.isArray(intakeSelection) && new Set(intakeSelection).size === intakeSelection.length)
  const eligible = new Set([...s.heroSlots, ...s.pendingIncoming].filter((i) => i !== null).map((i) => i.id))
  check(intakeSelection.every((id) => typeof id === 'string' && eligible.has(id))
    && (!intakeSelection.length || a.returned !== null || inheritedReturn({ ...s, legacy }, a)))
  return { ...s, intakeSelection, initialItemCount, slots: version === 2 ? [...s.slots, ...Array(WAREHOUSE_CAPACITY - s.slots.length).fill(null)] : s.slots, legacy, selection: null, moving: false, notice: '倉庫と冒険の記録を復元しました。' }
}
export function loadGame(storage: SaveStorage): LoadedGame {
  let raw: string | null
  try { raw = storage.getItem(SAVE_KEY) } catch {
    return { state: createGame(), blocked: true, message: '保存領域を読めません。記録を保護し、自動保存を停止しています。' }
  }
  if (raw === null) return { state: createGame(), blocked: false, message: '' }
  try {
    const data: unknown = JSON.parse(raw)
    check(object(data))
    if (data.version === 1) {
      const migrated = migrateLegacy(data.state)
      // Backup must succeed before replacing the version 1 record.
      storage.setItem(SAVE_BACKUP_KEY, raw)
      validateState(migrated)
      return { state: migrated, blocked: false, message: '' }
    }
    if (data.version === 2) return { state: validateState(data.state, 2), blocked: false, message: '' }
    if (data.version === 3) return { state: validateState(data.state, 3), blocked: false, message: '' }
    if (data.version !== SAVE_VERSION) return { state: createGame(), blocked: true,
      message: '非対応のセーブ形式です。元の記録を保護し、自動保存を停止しました。' }
    return { state: validateState(data.state), blocked: false, message: '' }
  } catch {
    return { state: createGame(), blocked: true,
      message: 'セーブを復元・移行できません。元の記録を保護し、自動保存を停止しました。初期化は記録を破棄してよい場合だけ行ってください。' }
  }
}
export function saveGame(storage: SaveStorage, state: GameState): void {
  storage.setItem(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, state: { ...state, selection: null, moving: false, notice: '' } }))
}
