import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createGame, currentAdventure, gameReducer, phase, HERO_CAPACITY } from '../src/game/game.ts'
import type { GameState, GameAction, Location } from '../src/game/game.ts'
import { ITEM_TYPES, createLegacyInventory } from '../src/game/data.ts'
import type { Item } from '../src/game/data.ts'
import { createReturnBatch, placeIncoming } from '../src/game/arrivals.ts'
import { loadGame, saveGame, validateState, migrateLegacy, legacyOwned, SAVE_KEY, SAVE_BACKUP_KEY, SAVE_VERSION } from '../src/game/save.ts'
import type { LegacyState } from '../src/game/legacy.ts'
const legacyFixtures = JSON.parse(readFileSync(new URL('./fixtures/version1.json', import.meta.url), 'utf8')) as Record<string, LegacyState>
const W = (slot: number): Location => ({ area: 'warehouse', slot })
const H = (slot: number): Location => ({ area: 'hero', slot })
const id = (s: GameState) => currentAdventure(s).id
const live = (s: GameState) => [...s.slots, ...s.heroSlots, ...s.pendingIncoming].filter((i): i is Item => !!i)
const ids = (s: GameState) => live(s).map((i) => i.id).sort()
function move(s: GameState, from: Location, to: Location): GameState {
  const item = (from.area === 'warehouse' ? s.slots : s.heroSlots)[from.slot]!
  return gameReducer(s, { type: 'transfer', from, to, itemId: item.id, adventureId: id(s) })
}
const depart = (s: GameState, now = 1_000_000, seed = 0) => gameReducer(s, { type: 'depart', adventureId: id(s), now, seed })
const welcome = (s: GameState, seed = 1500) => gameReducer(s, { type: 'return', adventureId: id(s), now: currentAdventure(s).timing!.returnAt, seed })
function storage(initial: string | null = null) {
  const map = new Map<string, string>()
  if (initial !== null) map.set(SAVE_KEY, initial)
  return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value) } }
}
function roundTrip(s: GameState) {
  const memory = storage(); saveGame(memory, s)
  const loaded = loadGame(memory)
  assert.equal(loaded.blocked, false)
  assert.deepEqual(loaded.state, { ...s, selection: null, moving: false, notice: '倉庫と冒険の記録を復元しました。' })
  return loaded.state
}

function fullWarehouse(): GameState {
  let s = createGame()
  while (s.slots.some((i) => i === null)) {
    s = welcome(depart(s))
    s = gameReducer(s, { type: 'next', adventureId: id(s) })
  }
  return s
}

test('initial warehouse has 160 slots, 48 scattered items, six per kind and eight empty hero slots', () => {
  const s = createGame()
  assert.equal(s.slots.length, 160); assert.equal(s.heroSlots.length, HERO_CAPACITY)
  assert.equal(new Set(ids(s)).size, 48)
  for (const kind of Object.keys(ITEM_TYPES)) assert.equal(s.slots.filter((i) => i?.kind === kind).length, 6)
  assert.equal(s.slots.filter((i) => i === null).length, 112)
  assert.ok(s.slots.slice(0, 20).some((i) => i === null))
  assert.ok(s.slots.slice(140).some(Boolean))
  assert.deepEqual(s, createGame()); assert.equal(phase(s, 0), 'preparing')
})
test('any kind can be prepared and returned with its original identity and no mutations', () => {
  let s = createGame(); const original = s
  for (const kind of Object.keys(ITEM_TYPES)) {
    const at = s.slots.findIndex((i) => i?.kind === kind)
    s = move(s, W(at), H(0)); assert.equal(s.heroSlots[0]?.kind, kind)
    s = move(s, H(0), W(at)); assert.equal(s.slots[at]?.kind, kind)
    assert.deepEqual(ids(s), ids(original))
  }
  assert.deepEqual(s.slots, original.slots)
})
test('occupied/empty warehouse and cross-inventory swaps conserve stock, even at capacity', () => {
  let s = createGame(); Object.freeze(s.slots)
  const a = s.slots[0], b = s.slots[156]
  s = move(s, W(0), W(156)); assert.equal(s.slots[0], b); assert.equal(s.slots[156], a)
  for (let i = 0; i < 8; i++) s = move(s, W(s.slots.findIndex(Boolean)), H(i))
  const action = { type: 'transfer', from: W(90), to: H(8), itemId: s.slots[90]!.id, adventureId: id(s) } as const
  assert.equal(gameReducer(s, action), s)
  const hero = s.heroSlots[0], warehouse = s.slots[90]
  s = move(s, W(90), H(0)); assert.equal(s.heroSlots[0], warehouse); assert.equal(s.slots[90], hero)
  s = move(s, H(0), H(7))
  assert.equal(ids(s).length, 48); assert.equal(new Set(ids(s)).size, 48)
})
test('selection is inspection; tap move supports swapping, empty slots and cancellation', () => {
  const initial = createGame()
  let s = gameReducer(initial, { type: 'select', at: W(0) })
  assert.equal(s.slots, initial.slots); assert.equal(s.selection?.itemId, initial.slots[0]!.id)
  s = gameReducer(s, { type: 'move' }); s = gameReducer(s, { type: 'select', at: H(0) })
  assert.equal(s.heroSlots[0], initial.slots[0]); assert.equal(s.selection, null)
  s = gameReducer(s, { type: 'select', at: H(0) }); s = gameReducer(s, { type: 'move' })
  s = gameReducer(s, { type: 'select', at: W(0) }); assert.deepEqual(s.slots, initial.slots)
  s = gameReducer(s, { type: 'select', at: W(3) }); s = gameReducer(s, { type: 'move' })
  s = gameReducer(s, { type: 'select', at: W(3) }); assert.equal(s.moving, false)
  s = gameReducer(s, { type: 'cancel' }); assert.equal(s.selection, null)
})
test('invalid, same-cell, stale ID, and previous-day transfers cannot change stock', () => {
  const s = createGame()
  const base = { type: 'transfer', from: W(0), to: H(0), itemId: s.slots[0]!.id, adventureId: id(s) } as const
  for (const action of [{ ...base, to: W(0) }, { ...base, to: W(-1) }, { ...base, to: H(NaN) },
    { ...base, itemId: 'wrong' }, { ...base, adventureId: 'day-0' }, { ...base, from: W(160) }]) assert.equal(gameReducer(s, action), s)
  const moved = gameReducer(s, base); assert.equal(gameReducer(moved, base), moved)
})
test('departure commits once, persists exact 60..180 seconds and locks hero inventory', () => {
  let s = move(createGame(), W(0), H(0)); const prepared = s
  s = depart(s); assert.equal(phase(s, 1_000_000), 'away')
  assert.deepEqual(currentAdventure(s).timing, { startedAt: 1_000_000, durationMs: 60000, returnAt: 1_060_000 })
  assert.equal(depart(s, 2_000_000, 120), s)
  assert.equal(move(s, H(0), W(0)), s); assert.equal(move(s, W(3), H(1)), s)
  assert.notEqual(move(s, W(3), W(6)), s)
  assert.equal(currentAdventure(s).issued[0], prepared.heroSlots[0])
  for (let seed = 0; seed <= 120; seed++) assert.equal(currentAdventure(depart(createGame(), 0, seed)).timing!.durationMs, (60 + seed) * 1000)
  for (const now of [NaN, Infinity, -1, Number.MAX_SAFE_INTEGER]) assert.equal(depart(prepared, now), prepared)
})
test('empty preparation can depart; no inventory can cause a softlock', () => {
  let s = depart(createGame())
  assert.equal(currentAdventure(s).issued.length, 0)
  s = welcome(s); assert.equal(s.pendingIncoming.length, 0); assert.equal(s.slots.filter(Boolean).length, 52)
  assert.equal(phase(s, 0), 'returned')
})
test('deadline gates return, repeats/stale next and return actions do not rerun anything', () => {
  const s = depart(move(createGame(), W(0), H(0)))
  assert.equal(phase(s, 1_059_999), 'away'); assert.equal(phase(s, 1_060_000), 'ready')
  const early: GameAction = { type: 'return', adventureId: id(s), now: 1_059_999, seed: 1 }
  assert.equal(gameReducer(s, early), s)
  assert.equal(gameReducer(s, { type: 'next', adventureId: id(s) }), s)
  const returned = welcome(s)
  assert.equal(gameReducer(returned, { ...early, now: 1_500_000 }), returned)
  const next = gameReducer(returned, { type: 'next', adventureId: id(s) })
  assert.equal(next.day, 2); assert.equal(next.slots, returned.slots); assert.equal(next.pendingIncoming, returned.pendingIncoming)
  assert.equal(gameReducer(next, { type: 'next', adventureId: id(s) }), next)
  assert.equal(gameReducer(next, { ...early, now: 1_500_000 }), next)
})
test('return keeps arranged cells, original equipment IDs, consumes supplies and queues overflow FIFO', () => {
  let s = fullWarehouse()
  for (const [n, kind] of ['sword','shield','potion','potion'].entries()) s = move(s, W(s.slots.findIndex((i) => i?.kind === kind)), H(n))
  const away = depart(s)
  const returned = welcome(away)
  for (const [slot, i] of away.slots.entries()) if (i) assert.equal(returned.slots[slot], i)
  const issued = currentAdventure(away).issued
  for (const i of issued) assert.equal(live(returned).some((candidate) => candidate.id === i.id), ITEM_TYPES[i.kind].category !== '消耗品')
  assert.equal(returned.pendingIncoming.length, 2)
  const full = gameReducer(returned, { type: 'receive', seed: 4 })
  assert.deepEqual(full.pendingIncoming, returned.pendingIncoming)
  let next = gameReducer(full, { type: 'next', adventureId: id(full) })
  next = move(next, W(0), H(0))
  const received = gameReducer(next, { type: 'receive', seed: 3 })
  assert.equal(received.pendingIncoming.length, 1)
  assert.ok(received.slots.some((i) => i?.id === returned.pendingIncoming[0].id))
  // A full warehouse still supports returning a prepared item by exchanging it.
  const exchanged = move(received, H(0), W(0))
  assert.equal(exchanged.slots[0], next.heroSlots[0]); assert.equal(exchanged.heroSlots[0], received.slots[0])
})
test('full warehouse incoming placement is pure, reproducible and never replaces occupied cells', () => {
  const s = fullWarehouse(), batch = createReturnBatch('test', [], 1500)
  Object.freeze(s.slots); Object.freeze(batch.items)
  const full = placeIncoming(s.slots, batch.items, 3)
  assert.deepEqual(full.slots, s.slots); assert.deepEqual(full.pendingIncoming, batch.items)
  const empty = [...s.slots]; empty[42] = null
  const partial = placeIncoming(empty, batch.items, 2)
  assert.equal(partial.slots[42], batch.items[0]); assert.deepEqual(partial.pendingIncoming, batch.items.slice(1))
  assert.deepEqual(createReturnBatch('test', [], 1500), batch)
  assert.notDeepEqual(placeIncoming(Array(160).fill(null), batch.items, 1).slots, placeIncoming(Array(160).fill(null), batch.items, 2).slots)
})
test('120 consecutive days and save round trips preserve ownership, positions and history', () => {
  let s = createGame()
  for (let day = 1; day <= 120; day++) {
    s = move(s, W(s.slots.findIndex(Boolean)), H(0)); s = roundTrip(s)
    s = roundTrip(depart(s, day * 1_000_000, day))
    const timing = currentAdventure(s).timing
    s = roundTrip(s); assert.deepEqual(currentAdventure(s).timing, timing)
    s = roundTrip(welcome(s, day * 129))
    assert.equal(new Set(ids(s)).size, ids(s).length)
    const slots = s.slots, pending = s.pendingIncoming
    s = roundTrip(gameReducer(s, { type: 'next', adventureId: id(s) }))
    assert.deepEqual(s.slots, slots); assert.deepEqual(s.pendingIncoming, pending)
  }
  assert.equal(s.day, 121); assert.equal(s.adventures.length, 121)
  assert.deepEqual(gameReducer(s, { type: 'reset' }), createGame())
})
test('save/load clears only transient selection; no deadline or return is rerolled', () => {
  let s = move(createGame(), W(0), H(0))
  s = gameReducer(s, { type: 'select', at: W(3) }); s = gameReducer(s, { type: 'move' })
  s = roundTrip(s); assert.equal(s.selection, null)
  s = roundTrip(depart(s, 5000, 75)); assert.equal(phase(s, 9999999), 'ready')
  s = roundTrip(welcome(s)); const saved = s
  assert.equal(welcome(s), saved)
})
test('version 1 initial, partial, completed, returned and next-day saves migrate without item loss', () => {
  for (const [name, legacy] of Object.entries(legacyFixtures)) {
    const raw = JSON.stringify({ version: 1, state: legacy })
    const memory = storage(raw), loaded = loadGame(memory)
    assert.equal(loaded.blocked, false, name)
    assert.equal(memory.getItem(SAVE_KEY), raw, 'load does not overwrite the original')
    assert.equal(memory.getItem(SAVE_BACKUP_KEY), raw)
    assert.deepEqual(loaded.state.slots.slice(0,96), legacy.slots)
    assert.equal(loaded.state.slots.length, 160)
    assert.ok(loaded.state.slots.slice(96).every((i) => i === null))
    assert.deepEqual(ids(loaded.state), legacyOwned(legacy).map((i) => i.id).sort())
    assert.equal(loaded.state.day, legacy.orderIndex + 1)
    const resumed = roundTrip(loaded.state)
    if (name === 'returned') {
      assert.equal(phase(resumed, 0), 'returned')
      assert.equal(gameReducer(resumed, { type: 'return', adventureId: id(resumed), now: 999999999, seed: 0 }), resumed)
    } else assert.equal(phase(resumed, 0), 'preparing')
    assert.equal(resumed.legacy!.returnHistory.length, legacy.returnHistory.length)
  }
})
test('migration queues a ninth legacy supplied item safely instead of exceeding hero capacity', () => {
  const legacy = structuredClone(legacyFixtures.returned) as any
  const kinds = ['sword','shield','staff']
  const issued: Item[] = []
  for (const kind of kinds) for (let n = 0; n < 3; n++) {
    const slot = legacy.slots.findIndex((i: Item | null) => i?.kind === kind)
    issued.push(legacy.slots[slot]); legacy.slots[slot] = null
  }
  legacy.orderIndex = 1; legacy.orders.push({ id: 'day-2', title: '旧注文', message: '旧注文', lines: kinds.map((kind) => ({kind,quantity:3})) })
  legacy.delivered = {sword:3,shield:3,staff:3}; legacy.totalDelivered += 9; legacy.issuedByOrder['day-2'] = issued
  const migrated = roundTrip(migrateLegacy(legacy))
  assert.equal(migrated.heroSlots.filter(Boolean).length, 8)
  assert.equal(migrated.pendingIncoming.at(-1)!.id, issued[8].id)
  assert.deepEqual(ids(migrated), legacyOwned(legacy).map((i) => i.id).sort())
})
test('corrupt, future, and unbackuppable legacy saves are blocked without overwriting originals', () => {
  assert.deepEqual(loadGame(storage()).state, createGame())
  for (const raw of ['{', 'null', JSON.stringify({ version: 999 }), JSON.stringify({version:SAVE_VERSION,state:{}})]) {
    const memory = storage(raw); assert.equal(loadGame(memory).blocked, true); assert.equal(memory.getItem(SAVE_KEY), raw)
  }
  const raw = JSON.stringify({version:1,state:legacyFixtures.partial})
  const memory = storage(raw)
  assert.equal(loadGame({...memory,setItem:()=>{throw Error('quota')}}).blocked, true)
  assert.equal(memory.getItem(SAVE_KEY), raw)
})
test('validator rejects time tampering, changed locked cargo, duplicate/lost stock and corrupted history', () => {
  const away = depart(move(createGame(), W(0), H(0)))
  const returned = welcome(away)
  const occupied = returned.slots.flatMap((item, slot) => item ? [slot] : [])
  const [first, second] = occupied
  const changes: ((s: any) => void)[] = [
    (s) => {s.slots[first]=s.slots[second]}, (s) => {s.slots[first]=null},
    (s) => {s.heroSlots.push(null)}, (s) => {s.day++},
    (s) => {s.adventures[0].returned.items.pop()}, (s) => {s.adventures[0].returned.report.lootCount++},
    (s) => {s.adventures[0].timing.returnAt++}, (s) => {s.adventures[0].timing.durationMs=0},
    (s) => {s.adventures[0].issued[0].id='fake'}, (s) => {s.pendingIncoming.push(s.slots[first])},
  ]
  for (const corrupt of changes) { const copy=structuredClone(returned); corrupt(copy); assert.throws(()=>validateState(copy)) }
  const wrongCargo = structuredClone(away) as any; wrongCargo.heroSlots[0]=null
  assert.throws(()=>validateState(wrongCargo))
})
test('storage read/write errors never mutate the live state or silently destroy saves', () => {
  const fail = { getItem:()=>{throw Error('denied')}, setItem:()=>{throw Error('quota')} }
  assert.equal(loadGame(fail).blocked, true)
  const s = depart(createGame()), before = structuredClone(s)
  assert.throws(()=>saveGame(fail,s),/quota/); assert.deepEqual(s,before)
})

test('version 2 saves keep all old stock, layout, cargo, timing, pending and history in 160 slots', () => {
  const classic: GameState = { ...createGame(), initialItemCount: 96, slots: createLegacyInventory() }
  const prepared = move(classic, W(0), H(0))
  const away = depart(prepared)
  const returned = welcome(away)
  const next = gameReducer(returned, { type: 'next', adventureId: id(returned) })
  const fromV1 = migrateLegacy(legacyFixtures.nextPartial)
  const nestedLegacy = { ...fromV1, slots: fromV1.slots.slice(0,96) }
  for (const original of [classic, prepared, away, returned, next, nestedLegacy]) {
    const raw = JSON.stringify({ version: 2, state: original }, (key, value) => key === 'initialItemCount' ? undefined : value)
    const memory = storage(raw)
    const loaded = loadGame(memory)
    assert.equal(loaded.blocked, false)
    assert.equal(memory.getItem(SAVE_KEY), raw, 'migration itself does not overwrite storage')
    assert.deepEqual(loaded.state.slots.slice(0,96), original.slots)
    assert.deepEqual(loaded.state.slots.slice(96), Array(64).fill(null))
    assert.deepEqual(loaded.state.heroSlots, original.heroSlots)
    assert.deepEqual(loaded.state.adventures, original.adventures)
    assert.deepEqual(loaded.state.pendingIncoming, original.pendingIncoming)
    assert.equal(loaded.state.initialItemCount, 96)
    assert.deepEqual(ids(loaded.state), ids(original))
    roundTrip(loaded.state)
  }
})
test('new and migrated stock use different immutable baselines without weakening loss detection', () => {
  const fresh = createGame()
  assert.equal(fresh.initialItemCount, 48)
  assert.throws(() => validateState({ ...fresh, initialItemCount: 96 }))
  assert.throws(() => validateState({ ...fresh, initialItemCount: 49 }))
  const classic: GameState = { ...fresh, initialItemCount: 96, slots: createLegacyInventory() }
  const broken = structuredClone(classic)
  const slots = [...broken.slots]; slots[0] = null
  const raw = JSON.stringify({ version: 2, state: { ...broken, slots } })
  const memory = storage(raw)
  assert.equal(loadGame(memory).blocked, true)
  assert.equal(memory.getItem(SAVE_KEY), raw)
})
