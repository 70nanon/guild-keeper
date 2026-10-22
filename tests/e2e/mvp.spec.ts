import { test, expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

test('small portrait screen keeps the order and actions visible with scrollable touch-size slots', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('./')
  await expect(page.locator('.item-slot')).toHaveCount(96)
  const metrics = await page.evaluate(() => {
    const inventory = document.querySelector('.inventory-scroll')!
    const slots = Array.from(document.querySelectorAll('.item-slot'))
    const actions = document.querySelector('.action-buttons')!.getBoundingClientRect()
    return {
      overflow: document.documentElement.scrollWidth > innerWidth,
      verticalOverflow: document.documentElement.scrollHeight > innerHeight,
      inventoryHeight: inventory.clientHeight,
      canScroll: inventory.scrollHeight > inventory.clientHeight,
      touchSize: slots.every((slot) => slot.getBoundingClientRect().width >= 44 && slot.getBoundingClientRect().height >= 44),
      actionsVisible: actions.top >= 0 && actions.bottom <= innerHeight,
    }
  })
  expect(metrics).toMatchObject({ overflow: false, verticalOverflow: false, canScroll: true, touchSize: true, actionsVisible: true })
  expect(metrics.inventoryHeight).toBeGreaterThanOrEqual(64)
  // Keyboard access uses the same native button actions without custom gestures.
  const first = page.locator('[data-slot="0"]')
  await first.focus()
  await page.keyboard.press('Enter')
  await expect(first).toHaveAttribute('aria-pressed', 'true')
})

test('the eight kinds use shared original SVGs in inventory, orders and selection', async ({ page, isMobile }) => {
  await page.goto('./')
  await expect(page.locator('.item-slot .item-glyph')).toHaveCount(96)
  const shapes = new Set<string>()
  for (const kind of ['sword', 'shield', 'potion', 'staff', 'herb', 'helm', 'ether', 'boots']) {
    const slot = page.locator(`.item-slot[data-kind="${kind}"]`).first()
    const glyph = slot.locator('svg')
    await expect(glyph).toHaveAttribute('data-glyph', kind)
    await expect(glyph).toHaveAttribute('viewBox', '0 0 16 16')
    await expect(glyph).toHaveAttribute('aria-hidden', 'true')
    shapes.add(await glyph.innerHTML())
    if (isMobile) await slot.tap()
    else await slot.click()
    await expect(page.locator('.selection-info svg')).toHaveAttribute('data-glyph', kind)
    expect(await page.locator('.selection-info svg').innerHTML()).toBe(await glyph.innerHTML())
  }
  expect(shapes.size).toBe(8)
  for (const row of await page.locator('.order-lines li').all()) {
    const kind = await row.locator('svg').getAttribute('data-glyph')
    const matching = page.locator(`.item-slot[data-kind="${kind}"] svg`).first()
    expect(await row.locator('svg').innerHTML()).toBe(await matching.innerHTML())
  }
  await expect(page.locator('svg text')).toHaveCount(0)
})


const saveKey = 'guild-keeper.save'
async function stored(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, saveKey)
}
async function finishOrder(page: Page, activate: (locator: Locator) => Promise<void>) {
  for (const row of await page.locator('.order-lines li').all()) {
    const kind = await row.locator('svg').getAttribute('data-glyph')
    const counts = (await row.locator('.quantity').innerText()).match(/(\d+)\s*\/\s*(\d+)/)!
    for (let i = Number(counts[1]); i < Number(counts[2]); i++) {
      await activate(page.locator(`.item-slot[data-kind="${kind}"]`).first())
      await activate(page.getByRole('button', { name: '納品する', exact: true }))
    }
  }
}

test('continuous daily play preserves rearrangement, pending receipts and ledgers across reloads', async ({ page, isMobile }, testInfo) => {
  const activate = (locator: Locator) => isMobile ? locator.tap() : locator.click()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => {
    Object.defineProperty(crypto, 'getRandomValues', { value: (a: Uint32Array) => { a.fill(1500); return a } })
  })
  if (isMobile) await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('./')
  const occupied = page.locator('.item-slot[data-item-id]')
  await expect(occupied).toHaveCount(96)
  await expect(page.locator('.order-number')).toHaveText('1日目')
  await expect(page.getByRole('button', { name: '翌日へ' })).toHaveCount(0)

  // Wrong delivery never consumes stock.
  await activate(page.locator('.item-slot[data-kind="staff"]').first())
  await activate(page.getByRole('button', { name: '納品する' }))
  await expect(page.getByRole('status')).toContainText('必要ありません')
  await expect(occupied).toHaveCount(96)
  await activate(page.getByRole('button', { name: '選択を解除' }))

  const first = page.locator('[data-slot="0"]')
  const second = page.locator('[data-slot="1"]')
  const firstId = await first.getAttribute('data-item-id')
  const secondId = await second.getAttribute('data-item-id')
  await activate(first)
  await activate(page.getByRole('button', { name: '入れ替える' }))
  await activate(second)
  await expect(first).toHaveAttribute('data-item-id', secondId!)
  await expect(second).toHaveAttribute('data-item-id', firstId!)

  // Partial issue survives reload; no item can be delivered twice.
  await activate(page.locator('.item-slot[data-kind="sword"]').first())
  await activate(page.getByRole('button', { name: '納品する' }))
  await expect(occupied).toHaveCount(95)
  const partial = await stored(page)
  await page.reload()
  await expect(occupied).toHaveCount(95)
  expect((await stored(page)).issuedByOrder).toEqual(partial.issuedByOrder)
  await expect(page.locator('.order-progress')).toContainText('1 / 4 個')

  // Move to an empty slot using taps only.
  const target = page.locator('.item-slot.is-empty').first()
  const source = occupied.first()
  const sourceId = await source.getAttribute('data-item-id')
  const targetSlot = await target.getAttribute('data-slot')
  await activate(source)
  await activate(page.getByRole('button', { name: '入れ替える' }))
  await activate(target)
  await expect(page.locator(`[data-slot="${targetSlot}"]`)).toHaveAttribute('data-item-id', sourceId!)

  for (let day = 1; day <= 4; day++) {
    await expect(page.locator('.order-number')).toHaveText(`${day}日目`)
    await finishOrder(page, activate)
    await expect(page.locator('.order-progress')).toContainText('注文完了')
    await expect(page.getByRole('button', { name: '翌日へ' })).toHaveCount(0)
    const beforeReturn = await stored(page)
    await page.reload()
    expect((await stored(page)).issuedByOrder).toEqual(beforeReturn.issuedByOrder)
    await activate(page.getByRole('button', { name: '勇者の帰還', exact: true }))
    await expect(page.locator('.return-comment')).toBeVisible()
    const returned = await stored(page)
    expect(returned.returnHistory).toHaveLength(day)
    for (let slot = 0; slot < 96; slot++) {
      if (beforeReturn.slots[slot]) expect(returned.slots[slot]).toEqual(beforeReturn.slots[slot])
    }
    if (day === 1) {
      expect(returned.pendingIncoming).toHaveLength(2)
      await activate(page.getByRole('button', { name: '受取待ちを入庫' }))
      await expect(page.getByRole('status')).toContainText('空き枠がありません')
      await page.screenshot({ path: `test-results/daily-${testInfo.project.name}.png` })
    }
    await page.reload()
    const restored = await stored(page)
    expect(restored.slots).toEqual(returned.slots)
    expect(restored.pendingIncoming).toEqual(returned.pendingIncoming)
    expect(restored.returnHistory).toEqual(returned.returnHistory)
    await expect(page.getByRole('button', { name: '勇者の帰還', exact: true })).toHaveCount(0)
    await activate(page.getByRole('button', { name: '翌日へ' }))
    await expect(page.locator('.order-number')).toHaveText(`${day + 1}日目`)
    const next = await stored(page)
    expect(next.slots).toEqual(returned.slots)
    expect(next.pendingIncoming).toEqual(returned.pendingIncoming)
    expect(next.returnHistory).toEqual(returned.returnHistory)
    if (next.pendingIncoming.length) {
      // A new delivery makes room; receiving keeps the original FIFO identity.
      const row = page.locator('.order-lines li').first()
      const kind = await row.locator('svg').getAttribute('data-glyph')
      await activate(page.locator(`.item-slot[data-kind="${kind}"]`).first())
      await activate(page.getByRole('button', { name: '納品する' }))
      await activate(page.getByRole('button', { name: '受取待ちを入庫' }))
      const received = await stored(page)
      expect(received.slots.some((item: { id: string } | null) => item?.id === next.pendingIncoming[0].id)).toBe(true)
    }
    await page.reload()
    await expect(page.locator('.order-number')).toHaveText(`${day + 1}日目`)
  }
  const layout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    pageOverflow: document.documentElement.scrollHeight > innerHeight,
    inventoryHeight: document.querySelector('.inventory-scroll')!.clientHeight,
  }))
  expect(layout.overflow).toBe(false)
  expect(layout.pageOverflow).toBe(false)
  expect(layout.inventoryHeight).toBeGreaterThanOrEqual(64)

  // Reset is destructive only after confirmation, and persists the fresh start.
  page.once('dialog', (dialog) => dialog.dismiss())
  await activate(page.getByRole('button', { name: '記録を初期化', exact: true }))
  await expect(page.locator('.order-number')).toHaveText('5日目')
  page.once('dialog', (dialog) => dialog.accept())
  await activate(page.getByRole('button', { name: '記録を初期化', exact: true }))
  await page.reload()
  await expect(page.locator('.order-number')).toHaveText('1日目')
  await expect(occupied).toHaveCount(96)
  expect((await stored(page)).returnHistory).toHaveLength(0)
  expect(errors).toEqual([])
})

for (const [name, raw] of [['破損', '{broken'], ['非対応バージョン', '{"version":999}']]) {
  test(`${name}のセーブを自動上書きせず初期化を確認する`, async ({ page }) => {
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: saveKey, value: raw })
    await page.goto('./')
    await expect(page.getByRole('alert')).toContainText('自動保存を停止')
    expect(await page.evaluate((key) => localStorage.getItem(key), saveKey)).toBe(raw)
    page.once('dialog', (dialog) => dialog.dismiss())
    await page.getByRole('button', { name: '記録を初期化して始める' }).click()
    expect(await page.evaluate((key) => localStorage.getItem(key), saveKey)).toBe(raw)
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: '記録を初期化して始める' }).click()
    await expect(page.locator('.order-number')).toHaveText('1日目')
    expect((await stored(page)).slots).toHaveLength(96)
  })
}

test('storage quota failure warns without blocking play or discarding the previous save', async ({ page }) => {
  await page.goto('./')
  const previous = await stored(page)
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Quota', 'QuotaExceededError') } })
  await page.locator('.item-slot[data-kind="sword"]').first().click()
  await page.getByRole('button', { name: '納品する' }).click()
  await expect(page.locator('.save-message')).toContainText('未保存の進行が失われます')
  await expect(page.locator('.item-slot[data-item-id]')).toHaveCount(95)
  expect((await stored(page)).slots).toEqual(previous.slots)
})
