import { test, expect } from '@playwright/test'
import type { Locator } from '@playwright/test'

// Independent, player-visible acceptance scenario: all 13 requested items.
const requests = [
  ['sword', 'shield', 'potion', 'potion'],
  ['staff', 'ether', 'ether', 'herb'],
  ['helm', 'boots', 'potion', 'herb', 'herb'],
]

test('pick, rearrange, deliver all orders and replay without dragging', async ({ page, isMobile }, testInfo) => {
  const activate = (locator: Locator) => isMobile ? locator.tap() : locator.click()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Guild Keeper' })).toBeVisible()
  const occupied = page.locator('.item-slot[data-item-id]')
  await expect(occupied).toHaveCount(96)

  // An incorrect delivery gives feedback and keeps all stock.
  await activate(page.locator('.item-slot[data-kind="staff"]').first())
  await activate(page.getByRole('button', { name: '納品する' }))
  await expect(page.getByRole('status')).toContainText('必要ありません')
  await expect(occupied).toHaveCount(96)
  await activate(page.getByRole('button', { name: '選択を解除' }))

  // Swap two physical slots, then verify both identities in the DOM.
  const first = page.locator('[data-slot="0"]')
  const second = page.locator('[data-slot="1"]')
  const firstId = await first.getAttribute('data-item-id')
  const secondId = await second.getAttribute('data-item-id')
  await activate(first)
  await activate(page.getByRole('button', { name: '入れ替える' }))
  await activate(second)
  await expect(first).toHaveAttribute('data-item-id', secondId!)
  await expect(second).toHaveAttribute('data-item-id', firstId!)
  await expect(occupied).toHaveCount(96)
  await page.screenshot({ path: `test-results/mvp-${testInfo.project.name}.png` })

  let count = 96
  for (const [index, kinds] of requests.entries()) {
    await expect(page.locator('.order-number')).toHaveText(`${index + 1} / 3`)
    await expect(page.getByRole('button', { name: '次の注文へ' })).toHaveCount(0)
    for (const kind of kinds) {
      const item = page.locator(`.item-slot[data-kind="${kind}"]`).first()
      const deliveredId = await item.getAttribute('data-item-id')
      await activate(item)
      await activate(page.getByRole('button', { name: '納品する' }))
      await expect(occupied).toHaveCount(--count)
      await expect(page.locator(`[data-item-id="${deliveredId}"]`)).toHaveCount(0)
      await expect(page.getByRole('button', { name: '納品する' })).toBeDisabled()
    }
    await expect(page.locator('.order-progress')).toContainText('注文完了')
    if (index < requests.length - 1) await activate(page.getByRole('button', { name: '次の注文へ' }))
  }
  await expect(occupied).toHaveCount(83)
  await expect(page.getByRole('status')).toContainText('すべての注文を完了')

  // Move into an empty delivery slot; progress and stock stay intact.
  const empty = page.locator('.item-slot.is-empty').first()
  const source = occupied.first()
  const sourceId = await source.getAttribute('data-item-id')
  await activate(source)
  await activate(page.getByRole('button', { name: '入れ替える' }))
  await activate(empty)
  await expect(page.locator(`[data-item-id="${sourceId}"]`)).toHaveCount(1)
  await expect(occupied).toHaveCount(83)
  await expect(page.getByRole('status')).toHaveText('空き枠へ移動しました。')

  await activate(page.getByRole('button', { name: '最初から遊ぶ' }))
  await expect(occupied).toHaveCount(96)
  await expect(page.locator('.order-number')).toHaveText('1 / 3')
  await expect(first).toHaveAttribute('data-item-id', firstId!)
  await expect(second).toHaveAttribute('data-item-id', secondId!)
  await expect(page.locator('.order-progress')).toContainText('0 / 4 個')
  expect(errors).toEqual([])
})

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


test('manual return keeps arrangements, cannot duplicate and preserves order progression and replay', async ({ page, isMobile }) => {
  const activate = (locator: Locator) => isMobile ? locator.tap() : locator.click()
  // A fixed entropy input exercises real overflow, without putting a test hook in the app.
  await page.addInitScript(() => {
    Object.defineProperty(crypto, 'getRandomValues', { value: (array: Uint32Array) => { array.fill(1500); return array } })
  })
  if (isMobile) await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('./')
  await expect(page.getByRole('button', { name: '勇者の帰還', exact: true })).toHaveCount(0)
  for (const kind of requests[0]) {
    await activate(page.locator(`.item-slot[data-kind="${kind}"]`).first())
    await activate(page.getByRole('button', { name: '納品する' }))
  }
  const occupied = page.locator('.item-slot[data-item-id]')
  // Rearrange before returning; each occupied slot must remain exactly there.
  const source = occupied.first()
  const target = occupied.nth(1)
  await activate(source)
  await activate(page.getByRole('button', { name: '入れ替える' }))
  await activate(target)
  const before = await occupied.evaluateAll((nodes) => nodes.map((e) => ({slot:e.getAttribute('data-slot'),id:e.getAttribute('data-item-id')})))
  await activate(page.getByRole('button', { name: '勇者の帰還', exact: true }))
  await expect(page.locator('.return-comment')).toBeVisible()
  await expect(page.locator('.return-report')).toContainText('返却 2個・消耗 2個')
  await expect(page.getByRole('button', { name: '勇者の帰還', exact: true })).toHaveCount(0)
  await expect(page.locator('.order-number')).toHaveText('1 / 3')
  await expect(occupied).toHaveCount(96)
  await expect(page.locator('.pending-arrivals')).toContainText('2個')
  await activate(page.getByRole('button', { name: '受取待ちを入庫' }))
  await expect(page.getByRole('status')).toContainText('空き枠がありません')
  await expect(occupied).toHaveCount(96)
  await page.locator('.return-comment').scrollIntoViewIfNeeded()
  await page.screenshot({ path: `test-results/return-${isMobile ? 'mobile' : 'desktop'}.png` })
  const layout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    pageOverflow: document.documentElement.scrollHeight > innerHeight,
    inventoryHeight: document.querySelector('.inventory-scroll')!.clientHeight,
  }))
  expect(layout.overflow).toBe(false)
  expect(layout.pageOverflow).toBe(false)
  expect(layout.inventoryHeight).toBeGreaterThanOrEqual(64)
  for (const item of before) await expect(page.locator(`[data-slot="${item.slot}"]`)).toHaveAttribute('data-item-id', item.id!)
  const allIds = await occupied.evaluateAll((nodes) => nodes.map((e) => e.getAttribute('data-item-id')))
  expect(new Set(allIds).size).toBe(96)
  for (let index = 1; index < requests.length; index++) {
    await activate(page.getByRole('button', { name: '次の注文へ' }))
    for (const kind of requests[index]) {
      await activate(page.locator(`.item-slot[data-kind="${kind}"]`).first())
      await activate(page.getByRole('button', { name: '納品する' }))
      if (await page.locator('.pending-arrivals').count()) {
        await activate(page.getByRole('button', { name: '受取待ちを入庫' }))
      }
    }
  }
  // The unreturned older order is still available even after the final order.
  await expect(page.locator('.return-caption')).toContainText('森を抜けるために')
  await activate(page.getByRole('button', { name: '最初から遊ぶ' }))
  await expect(occupied).toHaveCount(96)
  await expect(page.locator('.return-panel')).toHaveCount(0)
  await expect(page.locator('.order-number')).toHaveText('1 / 3')
})
