import { ITEM_TYPES } from './data.ts'
import type { Item, ItemKind, Order } from './data.ts'

// Only visible stock is requested, so pending arrivals never block progression.
export function createDailyOrder(day: number, slots: readonly (Item | null)[], seed: number): Order {
  let value = seed >>> 0
  const random = () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0
    return value / 0x100000000
  }
  const counts = new Map<ItemKind, number>()
  for (const item of slots) if (item) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1)
  const kinds = [...counts.keys()]
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[kinds[i], kinds[j]] = [kinds[j], kinds[i]]
  }
  if (!kinds.length) throw new Error('在庫が空のため注文を生成できません。')
  // Prefer equipment when available; loot still replenishes consumable-only stock.
  const equipment = kinds.find((kind) => ITEM_TYPES[kind].category !== '消耗品')
  const first = equipment ?? kinds[0]
  const selected = [first, ...kinds.filter((kind) => kind !== first).slice(0, 2)]
  return {
    id: `day-${day}`, title: '今日の冒険の支度',
    message: '今日も出かけてくるよ。倉庫にある道具を頼むね。',
    lines: selected.map((kind) => ({ kind, quantity: 1 + Math.floor(random() * Math.min(3, counts.get(kind)!)) })),
  }
}
