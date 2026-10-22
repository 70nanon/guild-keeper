export const ITEM_TYPES = {
  sword: { name: '鉄の剣', category: '武器', icon: '⚔️' },
  shield: { name: '木の盾', category: '防具', icon: '🛡️' },
  potion: { name: '回復薬', category: '消耗品', icon: '🧪' },
  staff: { name: '樫の杖', category: '武器', icon: '🪄' },
  herb: { name: '薬草', category: '消耗品', icon: '🌿' },
  helm: { name: '鉄の兜', category: '防具', icon: '🪖' },
  ether: { name: '魔力の雫', category: '消耗品', icon: '💧' },
  boots: { name: '革の靴', category: '防具', icon: '🥾' },
} as const

export type ItemKind = keyof typeof ITEM_TYPES
export type Item = Readonly<{ id: string; kind: ItemKind }>
export type Order = Readonly<{
  id: string
  title: string
  message: string
  lines: readonly Readonly<{ kind: ItemKind; quantity: number }>[]
}>

// Frozen version 1 first order, retained only for legacy save validation.
export const INITIAL_ORDER: Order = {
  id: 'day-1', title: '旅立ちの支度',
  message: '街道を進むよ。剣と盾、それから回復薬をお願い。',
  lines: [{ kind: 'sword', quantity: 1 }, { kind: 'shield', quantity: 1 }, { kind: 'potion', quantity: 2 }],
}

// Frozen 96-item stock for version 1/2 save validation; never rebalance it.
export function createLegacyInventory(): (Item | null)[] {
  const kinds = Object.keys(ITEM_TYPES) as ItemKind[]
  const items: Item[] = Array.from({ length: 96 }, (_, index) => ({
    id: `item-${index + 1}`, kind: kinds[index % kinds.length],
  }))
  let seed = 2718
  for (let index = items.length - 1; index > 0; index--) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    const target = seed % (index + 1)
    ;[items[index], items[target]] = [items[target], items[index]]
  }
  return items
}

export const WAREHOUSE_CAPACITY = 160
export const INITIAL_ITEM_COUNT = 48

// Six of each kind, mixed reproducibly and spaced across the entire warehouse.
export function createInventory(): (Item | null)[] {
  const items = createLegacyInventory().filter((item): item is Item => !!item && Number(item.id.slice(5)) <= INITIAL_ITEM_COUNT)
  const slots: (Item | null)[] = Array(WAREHOUSE_CAPACITY).fill(null)
  items.forEach((item, index) => { slots[Math.floor(index * WAREHOUSE_CAPACITY / items.length)] = item })
  return slots
}
