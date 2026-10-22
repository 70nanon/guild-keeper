import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createInventory, ITEM_TYPES, ORDERS } from '../src/game/data.ts'
import { createGame, gameReducer, isOrderComplete, isFinished, getReturnableOrder } from '../src/game/game.ts'
import type { GameState } from '../src/game/game.ts'
import type { ItemKind } from '../src/game/data.ts'
import { createReturnBatch, placeIncoming } from '../src/game/arrivals.ts'

const ids = (state: GameState) => state.slots.flatMap((item) => item ? [item.id] : []).sort()
function deliverKind(state: GameState, kind: ItemKind): GameState {
  const slot = state.slots.findIndex((item) => item?.kind === kind)
  assert.notEqual(slot, -1, `available inventory for ${kind}`)
  const selected = gameReducer(state, { type: 'select', slot })
  return gameReducer(selected, { type: 'deliver', itemId: selected.selectedId!, orderId: ORDERS[selected.orderIndex].id })
}
function fulfill(state: GameState): GameState {
  for (const line of ORDERS[state.orderIndex].lines) {
    for (let n = 0; n < line.quantity; n++) state = deliverKind(state, line.kind)
  }
  return state
}

test('initial inventory has 96 unique items and enough of each kind for all fixed orders', () => {
  const slots = createInventory()
  assert.equal(slots.length, 96)
  assert.equal(new Set(slots.map((item) => item!.id)).size, 96)
  for (const kind of Object.keys(ITEM_TYPES)) {
    const required = ORDERS.flatMap((order) => order.lines).filter((line) => line.kind === kind).reduce((sum, line) => sum + line.quantity, 0)
    assert.ok(slots.filter((item) => item?.kind === kind).length >= required)
  }
  assert.deepEqual(slots, createInventory())
})

test('selection, cancellation and invalid slots never modify inventory', () => {
  const state = createGame()
  const selected = gameReducer(state, { type: 'select', slot: 0 })
  assert.equal(selected.selectedId, state.slots[0]!.id)
  assert.equal(gameReducer(selected, { type: 'select', slot: 0 }).selectedId, null)
  assert.deepEqual(ids(gameReducer(selected, { type: 'cancel' })), ids(state))
  for (const slot of [-1, 96, 1.5, NaN]) assert.equal(gameReducer(selected, { type: 'select', slot }), selected)
})

test('swapping preserves every unique item and does not mutate the previous state', () => {
  const initial = createGame()
  Object.freeze(initial.slots)
  const moving = gameReducer(gameReducer(initial, { type: 'select', slot: 0 }), { type: 'move' })
  const swapped = gameReducer(moving, { type: 'select', slot: 95 })
  assert.equal(swapped.slots[0], initial.slots[95])
  assert.equal(swapped.slots[95], initial.slots[0])
  assert.deepEqual(ids(swapped), ids(initial))
  assert.equal(swapped.selectedId, null)
  assert.equal(swapped.moving, false)
  const cancelled = gameReducer(moving, { type: 'select', slot: 0 })
  assert.equal(cancelled.slots, initial.slots)
  assert.equal(cancelled.moving, false)
})

test('a valid delivery removes exactly its item, leaves an empty slot, and rejects repeated/stale actions', () => {
  const initial = createGame()
  const slot = initial.slots.findIndex((item) => item?.kind === 'sword')
  const selected = gameReducer(initial, { type: 'select', slot })
  const action = { type: 'deliver', itemId: selected.selectedId!, orderId: ORDERS[0].id } as const
  const delivered = gameReducer(selected, action)
  assert.equal(delivered.slots[slot], null)
  assert.equal(delivered.delivered.sword, 1)
  assert.equal(ids(delivered).length, 95)
  assert.equal(delivered.totalDelivered, 1)
  assert.equal(gameReducer(delivered, action), delivered)
  const reselection = gameReducer(delivered, { type: 'select', slot: delivered.slots.findIndex(Boolean) })
  assert.equal(gameReducer(reselection, action), reselection)
  assert.equal(initial.slots[slot]!.id, action.itemId)
})

test('wrong kinds, excess quantities and moving mode cannot consume an item', () => {
  const initial = createGame()
  const wrong = deliverKind(initial, 'staff')
  assert.deepEqual(ids(wrong), ids(initial))
  assert.equal(wrong.totalDelivered, 0)
  assert.match(wrong.notice, /必要ありません/)
  const once = deliverKind(initial, 'sword')
  const excess = deliverKind(once, 'sword')
  assert.deepEqual(ids(excess), ids(once))
  assert.equal(excess.delivered.sword, 1)
  const moving = gameReducer(gameReducer(initial, { type: 'select', slot: 0 }), { type: 'move' })
  assert.equal(gameReducer(moving, { type: 'deliver', itemId: moving.selectedId!, orderId: ORDERS[0].id }), moving)
})

test('a selected item can move into an empty slot without changing stock or order progress', () => {
  const delivered = deliverKind(createGame(), 'sword')
  const empty = delivered.slots.findIndex((item) => item === null)
  const origin = delivered.slots.findIndex(Boolean)
  const moving = gameReducer(gameReducer(delivered, { type: 'select', slot: origin }), { type: 'move' })
  const moved = gameReducer(moving, { type: 'select', slot: empty })
  assert.equal(moved.slots[origin], null)
  assert.equal(moved.slots[empty], delivered.slots[origin])
  assert.deepEqual(ids(moved), ids(delivered))
  assert.deepEqual(moved.delivered, delivered.delivered)
})

test('only completed orders advance; repeated next events cannot skip an order or restore stock', () => {
  const initial = createGame()
  const next = { type: 'next', orderId: ORDERS[0].id } as const
  assert.equal(gameReducer(initial, next), initial)
  const complete = fulfill(initial)
  assert.ok(isOrderComplete(complete))
  const advanced = gameReducer(complete, next)
  assert.equal(advanced.orderIndex, 1)
  assert.equal(advanced.slots, complete.slots)
  assert.deepEqual(advanced.delivered, {})
  assert.equal(gameReducer(advanced, next), advanced)
  assert.equal(gameReducer(advanced, { type: 'deliver', itemId: 'item-1', orderId: ORDERS[0].id }), advanced)
})

test('all orders are solvable after rearrangement; reset restores the whole initial state', () => {
  const initial = createGame()
  let state = gameReducer(gameReducer(gameReducer(initial, { type: 'select', slot: 1 }), { type: 'move' }), { type: 'select', slot: 80 })
  for (const order of ORDERS) {
    state = fulfill(state)
    assert.ok(isOrderComplete(state))
    assert.equal(new Set(ids(state)).size, ids(state).length)
    assert.equal(ids(state).length + state.totalDelivered, 96)
    if (order !== ORDERS.at(-1)) state = gameReducer(state, { type: 'next', orderId: order.id })
  }
  assert.ok(isFinished(state))
  assert.equal(state.totalDelivered, 13)
  assert.equal(gameReducer(state, { type: 'next', orderId: ORDERS.at(-1)!.id }), state)
  assert.deepEqual(gameReducer(state, { type: 'reset' }), initial)
})


test('return is available only for completed orders and records each expedition exactly once', () => {
  const initial = createGame()
  const action = { type: 'return', orderId: ORDERS[0].id, seed: 1500 } as const
  assert.equal(getReturnableOrder(initial), null)
  assert.equal(gameReducer(initial, action), initial)
  const complete = fulfill(initial)
  assert.equal(gameReducer(complete, { ...action, orderId: ORDERS[1].id }), complete)
  const returned = gameReducer(complete, action)
  assert.deepEqual(returned.returnedOrderIds, [ORDERS[0].id])
  assert.equal(gameReducer(returned, action), returned)
  assert.equal(getReturnableOrder(returned), null)
  assert.equal(returned.orderIndex, 0)
  assert.deepEqual(returned.delivered, complete.delivered)
})

test('equipment returns with its original identity; consumables are used and loot has unique IDs', () => {
  const complete = fulfill(createGame())
  const issued = complete.issuedByOrder[ORDERS[0].id]!
  Object.freeze(complete.slots)
  Object.freeze(issued)
  const action = { type: 'return', orderId: ORDERS[0].id, seed: 1500 } as const
  const returned = gameReducer(complete, action)
  assert.deepEqual(returned, gameReducer(complete, action), 'explicit randomness is reproducible')
  const all = [...returned.slots.filter((item) => item !== null), ...returned.pendingIncoming]
  for (const item of issued) {
    if (ITEM_TYPES[item.kind].category === '消耗品') assert.ok(!all.some((candidate) => candidate.id === item.id))
    else assert.equal(all.find((candidate) => candidate.id === item.id), item)
  }
  assert.equal(returned.lastReturn!.equipmentCount, 2)
  assert.equal(returned.lastReturn!.consumedCount, 2)
  assert.ok(returned.lastReturn!.lootCount >= 2 && returned.lastReturn!.lootCount <= 4)
  assert.equal(all.length, 96 - 2 + returned.lastReturn!.lootCount)
  assert.equal(new Set(all.map((item) => item.id)).size, all.length)
  assert.match(returned.lastReturn!.comment, /ただいま|戻った|寄り道/)
  assert.equal(complete.issuedByOrder[ORDERS[0].id]!.length, 4, 'previous state is untouched')
})

test('incoming items only fill random empty slots and preserve every arranged occupied slot', () => {
  let state = createGame()
  state = gameReducer(gameReducer(gameReducer(state, { type: 'select', slot: 0 }), { type: 'move' }), { type: 'select', slot: 90 })
  const complete = fulfill(state)
  const returned = gameReducer(complete, { type: 'return', orderId: ORDERS[0].id, seed: 1500 })
  for (const [slot, item] of complete.slots.entries()) if (item) assert.equal(returned.slots[slot], item)
  assert.equal(returned.slots.length, 96)
  const batch = createReturnBatch('test', [], 1500)
  const slots = Array(12).fill(null)
  assert.notDeepEqual(placeIncoming(slots, batch.items, 1).slots, placeIncoming(slots, batch.items, 2).slots)
  assert.deepEqual(placeIncoming(slots, batch.items, 1), placeIncoming(slots, batch.items, 1))
})

test('overflow stays queued; receiving after deliveries does not reroll or duplicate the batch', () => {
  const complete = fulfill(createGame())
  const returned = gameReducer(complete, { type: 'return', orderId: ORDERS[0].id, seed: 1500 })
  assert.equal(ids(returned).length, 96)
  assert.equal(returned.pendingIncoming.length, 2)
  const waitingIds = returned.pendingIncoming.map((item) => item.id)
  const noRoom = gameReducer(returned, { type: 'receive', seed: 9 })
  assert.equal(noRoom.slots, returned.slots)
  assert.equal(noRoom.pendingIncoming, returned.pendingIncoming)
  let next = gameReducer(noRoom, { type: 'next', orderId: ORDERS[0].id })
  assert.deepEqual(next.pendingIncoming, returned.pendingIncoming)
  next = deliverKind(next, 'staff')
  const received = gameReducer(next, { type: 'receive', seed: 4 })
  assert.equal(received.pendingIncoming.length, 1)
  assert.ok(ids(received).includes(waitingIds[0]))
  assert.equal(received.pendingIncoming[0].id, waitingIds[1])
  assert.equal(received.lastReturn, returned.lastReturn)
  const repeated = gameReducer(received, { type: 'receive', seed: 4 })
  assert.deepEqual(repeated.slots, received.slots)
  assert.deepEqual(repeated.pendingIncoming, received.pendingIncoming)
  assert.equal(gameReducer(repeated, { type: 'return', orderId: ORDERS[0].id, seed: 123 }), repeated)
})

test('a completely full warehouse retains the entire incoming batch without mutation', () => {
  const state = createGame()
  const incoming = createReturnBatch('full-test', [], 1500).items
  Object.freeze(state.slots)
  Object.freeze(incoming)
  const result = placeIncoming(state.slots, incoming, 2)
  assert.deepEqual(result.slots, state.slots)
  assert.deepEqual(result.pendingIncoming, incoming)
  assert.equal(result.placed, 0)
  const oneEmpty = [...state.slots]
  oneEmpty[42] = null
  const partial = placeIncoming(oneEmpty, result.pendingIncoming, 8)
  assert.equal(partial.slots[42], incoming[0])
  assert.deepEqual(partial.pendingIncoming, incoming.slice(1))
})

test('skipped returns remain available and replay clears all ledgers, receipts and pending items', () => {
  let state = createGame()
  for (const order of ORDERS) {
    state = fulfill(state)
    if (order !== ORDERS.at(-1)) state = gameReducer(state, { type: 'next', orderId: order.id })
  }
  assert.ok(isFinished(state))
  for (const order of ORDERS) {
    assert.equal(getReturnableOrder(state)!.id, order.id)
    state = gameReducer(state, { type: 'return', orderId: order.id, seed: 1500 })
    const all = [...ids(state), ...state.pendingIncoming.map((item) => item.id)]
    assert.equal(new Set(all).size, all.length)
    assert.ok(isFinished(state))
  }
  assert.equal(getReturnableOrder(state), null)
  assert.deepEqual(state.returnedOrderIds, ORDERS.map((order) => order.id))
  assert.deepEqual(gameReducer(state, { type: 'reset' }), createGame())
})
