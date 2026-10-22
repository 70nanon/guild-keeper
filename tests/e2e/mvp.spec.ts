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
