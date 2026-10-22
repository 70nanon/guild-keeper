import { createInventory, ITEM_TYPES, ORDERS } from './data.ts'
import type { Item, ItemKind } from './data.ts'
import { createReturnBatch, placeIncoming } from './arrivals.ts'
import type { ReturnReport } from './arrivals.ts'

export type GameState = Readonly<{
  slots: readonly (Item | null)[]
  orderIndex: number
  delivered: Readonly<Partial<Record<ItemKind, number>>>
  totalDelivered: number
  issuedByOrder: Readonly<Partial<Record<string, readonly Item[]>>>
  returnedOrderIds: readonly string[]
  pendingIncoming: readonly Item[]
  lastReturn: ReturnReport | null
  selectedId: string | null
  moving: boolean
  notice: string
}>

export type GameAction =
  | { type: 'select'; slot: number }
  | { type: 'move' }
  | { type: 'cancel' }
  | { type: 'deliver'; itemId: string; orderId: string }
  | { type: 'next'; orderId: string }
  | { type: 'return'; orderId: string; seed: number }
  | { type: 'receive'; seed: number }
  | { type: 'reset' }

export function createGame(): GameState {
  return {
    slots: createInventory(), orderIndex: 0, delivered: {}, totalDelivered: 0,
    issuedByOrder: {}, returnedOrderIds: [], pendingIncoming: [], lastReturn: null,
    selectedId: null, moving: false,
    notice: '品を選んで納品。並べ替えるときは「入れ替える」を押してください。',
  }
}

export function getSelectedItem(state: GameState) {
  return state.slots.find((item) => item?.id === state.selectedId) ?? null
}

export function isOrderComplete(state: GameState): boolean {
  return ORDERS[state.orderIndex].lines.every(
    ({ kind, quantity }) => (state.delivered[kind] ?? 0) === quantity,
  )
}

export function isFinished(state: GameState): boolean {
  return state.orderIndex === ORDERS.length - 1 && isOrderComplete(state)
}

export function getReturnableOrder(state: GameState) {
  return ORDERS.find((order, index) =>
    (index < state.orderIndex || (index === state.orderIndex && isOrderComplete(state)))
    && !state.returnedOrderIds.includes(order.id),
  ) ?? null
}

// Every transition validates the current state. UI actions carry the original
// item and order IDs so repeated/stale events cannot deliver another item/order.
export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'select': {
      if (!Number.isInteger(action.slot) || action.slot < 0 || action.slot >= state.slots.length) return state
      const target = state.slots[action.slot]
      const selected = getSelectedItem(state)
      if (state.moving && selected) {
        const origin = state.slots.findIndex((item) => item?.id === selected.id)
        if (origin === action.slot) return { ...state, moving: false, notice: '入れ替えをキャンセルしました。' }
        const slots = [...state.slots]
        ;[slots[origin], slots[action.slot]] = [slots[action.slot], slots[origin]]
        return { ...state, slots, selectedId: null, moving: false,
          notice: target ? 'ふたつの品を入れ替えました。' : '空き枠へ移動しました。' }
      }
      if (!target) return { ...state, notice: '空き枠です。品を選び「入れ替える」で移動できます。' }
      const selectedId = target.id === state.selectedId ? null : target.id
      return { ...state, selectedId, moving: false,
        notice: selectedId ? `${ITEM_TYPES[target.kind].name}を選びました。` : '選択を解除しました。' }
    }
    case 'move':
      return getSelectedItem(state) ? { ...state, moving: true, notice: '移動先の枠をタップしてください。品があれば入れ替えます。' } : state
    case 'cancel':
      return { ...state, selectedId: null, moving: false, notice: '選択を解除しました。' }
    case 'deliver': {
      const order = ORDERS[state.orderIndex]
      const selected = getSelectedItem(state)
      if (action.orderId !== order.id || !selected || selected.id !== action.itemId || state.moving || isOrderComplete(state)) return state
      const line = order.lines.find(({ kind }) => kind === selected.kind)
      if (!line || (state.delivered[selected.kind] ?? 0) >= line.quantity) {
        return { ...state, notice: 'この品は今の注文に必要ありません。在庫はそのままです。' }
      }
      const next: GameState = {
        ...state,
        slots: state.slots.map((item) => item?.id === selected.id ? null : item),
        delivered: { ...state.delivered, [selected.kind]: (state.delivered[selected.kind] ?? 0) + 1 },
        issuedByOrder: { ...state.issuedByOrder, [order.id]: [...(state.issuedByOrder[order.id] ?? []), selected] },
        totalDelivered: state.totalDelivered + 1, selectedId: null, moving: false,
        notice: `${ITEM_TYPES[selected.kind].name}を1個納品しました。`,
      }
      return isOrderComplete(next)
        ? { ...next, notice: isFinished(next) ? 'すべての注文を完了しました。お疲れさま！' : '注文を完了しました。次の注文へ進めます。' }
        : next
    }
    case 'next':
      if (action.orderId !== ORDERS[state.orderIndex].id || !isOrderComplete(state) || isFinished(state)) return state
      return { ...state, orderIndex: state.orderIndex + 1, delivered: {}, selectedId: null, moving: false,
        notice: '次の注文が届きました。倉庫の配置はそのままです。' }
    case 'return': {
      const order = getReturnableOrder(state)
      if (!order || order.id !== action.orderId) return state
      const batch = createReturnBatch(order.id, state.issuedByOrder[order.id] ?? [], action.seed)
      const arrivals = placeIncoming(state.slots, [...state.pendingIncoming, ...batch.items], action.seed)
      return {
        ...state, slots: arrivals.slots, pendingIncoming: arrivals.pendingIncoming,
        issuedByOrder: { ...state.issuedByOrder, [order.id]: [] },
        returnedOrderIds: [...state.returnedOrderIds, order.id], lastReturn: batch.report,
        selectedId: null, moving: false,
        notice: `勇者が帰還しました。装備${batch.report.equipmentCount}個・戦利品${batch.report.lootCount}個を持ち帰り、${arrivals.placed}個入庫しました。${arrivals.pendingIncoming.length ? `受取待ち${arrivals.pendingIncoming.length}個は保管しています。` : ''}`,
      }
    }
    case 'receive': {
      if (!state.pendingIncoming.length) return state
      const arrivals = placeIncoming(state.slots, state.pendingIncoming, action.seed)
      if (!arrivals.placed) return { ...state, notice: '空き枠がありません。受取待ちの品はそのまま保管しています。' }
      return { ...state, slots: arrivals.slots, pendingIncoming: arrivals.pendingIncoming,
        selectedId: null, moving: false,
        notice: `${arrivals.placed}個を入庫しました。受取待ちは${arrivals.pendingIncoming.length}個です。` }
    }
    case 'reset':
      return createGame()
  }
}
