import { ITEM_TYPES } from './data.ts'
import type { Item, ItemKind } from './data.ts'

// Randomness is explicit: reducers stay reproducible under React StrictMode.
function randomSource(seed: number) {
  let value = seed >>> 0
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0
    return value / 0x100000000
  }
}

export function createReturnBatch(orderId: string, issued: readonly Item[], seed: number) {
  const random = randomSource(seed)
  const equipment = issued.filter((item) => ITEM_TYPES[item.kind].category !== '消耗品')
  const kinds = Object.keys(ITEM_TYPES) as ItemKind[]
  const loot: Item[] = Array.from({ length: 2 + Math.floor(random() * 3) }, (_, index) => ({
    id: `loot-${orderId}-${index + 1}`,
    kind: kinds[Math.floor(random() * kinds.length)],
  }))
  const comments = [
    'ただいま！道で役立ちそうな物を拾ったぞ。',
    '戻ったぞ！道具も持ち帰った。あとは頼む！',
    'ちょっと寄り道したら、荷物が増えちゃった！',
  ]
  return {
    items: [...equipment, ...loot],
    report: {
      orderId, equipmentCount: equipment.length, lootCount: loot.length,
      consumedCount: issued.length - equipment.length,
      comment: comments[Math.floor(random() * comments.length)],
    },
  }
}

export type ReturnReport = ReturnType<typeof createReturnBatch>['report']

// Only null slots can change; overflow remains in an explicit receipt queue.
export function placeIncoming(slots: readonly (Item | null)[], incoming: readonly Item[], seed: number) {
  const random = randomSource(seed)
  const nextSlots = [...slots]
  const emptySlots = slots.flatMap((item, index) => item === null ? [index] : [])
  const count = Math.min(emptySlots.length, incoming.length)
  for (let index = 0; index < count; index++) {
    const [slot] = emptySlots.splice(Math.floor(random() * emptySlots.length), 1)
    nextSlots[slot] = incoming[index]
  }
  return { slots: nextSlots, pendingIncoming: incoming.slice(count), placed: count }
}
