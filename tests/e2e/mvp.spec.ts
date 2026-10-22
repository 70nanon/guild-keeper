import { test, expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
const key = 'guild-keeper.save'
const legacy = JSON.parse(readFileSync(new URL('../fixtures/version1.json', import.meta.url), 'utf8'))
const W = (page: Page, n: number) => page.locator(`[data-area="warehouse"][data-slot="${n*3}"]`)
const H = (page: Page, n: number) => page.locator(`[data-area="hero"][data-slot="${n}"]`)
const stock = (page: Page) => page.locator('[data-area="warehouse"][data-item-id]')
const stored = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, key)
async function point(locator: Locator) {
  await locator.scrollIntoViewIfNeeded()
  const box = (await locator.boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}
async function touchDrag(page: Page, source: Locator, target: Locator) {
  // Real Chromium touch input exercises scroll cancellation and preventDefault;
  // synthetic DOM touch events would not prove native scrolling behavior.
  const from = await point(source), to = await point(target)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...from, id: 1 }] })
  await expect(page.locator('.drag-ghost')).toBeVisible()
  for (let n = 1; n <= 8; n++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x-from.x)*n/8, y: from.y + (to.y-from.y)*n/8, id: 1 }] })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(page.locator('.drag-ghost')).toHaveCount(0)
  await cdp.detach()
}

test('tap-only free preparation, mid-adventure sorting, persisted deadlines and four daily loops', async ({ page, isMobile }, testInfo) => {
  const activate = (l: Locator) => isMobile ? l.tap() : l.click()
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message))
  let now = new Date('2026-10-22T12:00:00Z').getTime()
  await page.clock.setFixedTime(now)
  await page.goto('./')
  await expect(stock(page)).toHaveCount(48)
  await expect(page.getByRole('heading', {name:'勇者の持ち物'})).toBeVisible()
  // Inspection never moves an item; the explicit command prepares it.
  const original = await W(page,0).getAttribute('data-item-id')
  await activate(W(page,0)); await expect(stock(page)).toHaveCount(48)
  await activate(page.getByRole('button', {name:'勇者へ渡す'}))
  await expect(H(page,0)).toHaveAttribute('data-item-id', original!)
  await page.reload(); await expect(H(page,0)).toHaveAttribute('data-item-id', original!)
  await activate(H(page,0)); await activate(page.getByRole('button', {name:'倉庫へ戻す'}))
  await expect(W(page,0)).toHaveAttribute('data-item-id', original!)
  for (let day=1; day<=4; day++) {
    await expect(page.locator('.day-number')).toHaveText(`${day}日目`)
    await activate(stock(page).first()); await activate(page.getByRole('button', {name:'勇者へ渡す'}))
    // A second item can move by selecting an exact destination, without dragging.
    await activate(stock(page).first()); await activate(page.getByRole('button', {name:'移動・交換'}))
    await activate(H(page,1))
    const prepared = await stored(page)
    if (day===1) await page.screenshot({path:`test-results/preparation-${testInfo.project.name}.png`})
    await activate(page.getByRole('button', {name:'準備完了・出発'}))
    await expect(page.locator('[data-phase="away"]')).toBeVisible()
    const away = await stored(page), a = away.adventures.at(-1)
    expect(a.timing.startedAt).toBe(now)
    expect(a.timing.durationMs).toBeGreaterThanOrEqual(60000); expect(a.timing.durationMs).toBeLessThanOrEqual(180000)
    expect(a.issued).toEqual(prepared.heroSlots.filter(Boolean))
    await activate(H(page,0)); await expect(page.getByRole('button', {name:'倉庫へ戻す'})).toBeDisabled()
    await expect(page.getByRole('button', {name:'移動・交換'})).toBeDisabled()
    // Inventory remains editable while hero cargo is locked.
    const cells = await stock(page).all(); const left = cells[0], right = cells[1]
    const leftId = await left.getAttribute('data-item-id'), rightId = await right.getAttribute('data-item-id')
    await activate(left); await activate(page.getByRole('button', {name:'移動・交換'})); await activate(right)
    await expect(left).toHaveAttribute('data-item-id', rightId!); await expect(right).toHaveAttribute('data-item-id', leftId!)
    const sorted = await stored(page)
    if (day===1) await page.screenshot({path:`test-results/adventure-${testInfo.project.name}.png`})
    now = a.timing.returnAt - 30000
    await page.clock.setFixedTime(now); await page.reload()
    await expect(page.locator('.adventure-time')).toContainText('残り 0:30')
    expect((await stored(page)).slots).toEqual(sorted.slots)
    expect((await stored(page)).adventures.at(-1).timing).toEqual(a.timing)
    await expect(page.getByRole('button', {name:'帰還を迎える'})).toHaveCount(0)
    // Simulate reopening after the deadline; no timer re-roll or automatic day advance.
    now = a.timing.returnAt + 1000
    await page.clock.setFixedTime(now); await page.reload()
    await expect(page.locator('[data-phase="ready"]')).toBeVisible()
    await expect(page.locator('.adventure-time')).toContainText('残り 0:00')
    await activate(page.getByRole('button', {name:'帰還を迎える'}))
    await expect(page.locator('[data-phase="returned"]')).toBeVisible()
    const returned = await stored(page)
    await page.reload()
    await expect(page.getByRole('button', {name:'帰還を迎える'})).toHaveCount(0)
    expect((await stored(page)).slots).toEqual(returned.slots)
    expect((await stored(page)).pendingIncoming).toEqual(returned.pendingIncoming)
    const all = [...returned.slots,...returned.heroSlots,...returned.pendingIncoming].filter(Boolean)
    expect(new Set(all.map((i:{id:string})=>i.id)).size).toBe(all.length)
    if (day===1) await page.screenshot({path:`test-results/free-loop-${testInfo.project.name}.png`})
    await activate(page.getByRole('button', {name:'翌日へ'}))
    await expect(page.locator('.day-number')).toHaveText(`${day+1}日目`)
    expect((await stored(page)).slots).toEqual(returned.slots)
    expect((await stored(page)).pendingIncoming).toEqual(returned.pendingIncoming)
    now += 1000; await page.clock.setFixedTime(now)
  }
  expect((await stored(page)).adventures.filter((a:{returned:unknown})=>a.returned)).toHaveLength(4)
  expect(errors).toEqual([])
})

test('native mouse or held touch drag moves, swaps, gives, takes back and cancels invalid drops', async ({ page, isMobile }) => {
  await page.goto('./')
  const drag = (from: Locator,to: Locator) => isMobile ? touchDrag(page,from,to) : from.dragTo(to)
  const a = await W(page,0).getAttribute('data-item-id'), b = await W(page,1).getAttribute('data-item-id')
  await drag(W(page,0),W(page,1))
  await expect(W(page,0)).toHaveAttribute('data-item-id',b!); await expect(W(page,1)).toHaveAttribute('data-item-id',a!)
  await drag(W(page,1),H(page,0)); await expect(H(page,0)).toHaveAttribute('data-item-id',a!)
  await expect(W(page,1)).not.toHaveAttribute('data-item-id')
  await drag(H(page,0),W(page,1)); await expect(W(page,1)).toHaveAttribute('data-item-id',a!)
  await drag(W(page,0),H(page,0)); await expect(H(page,0)).toHaveAttribute('data-item-id',b!)
  await drag(H(page,0),H(page,1))
  await expect(H(page,1)).toHaveAttribute('data-item-id',b!)
  const before = await stored(page)
  await drag(W(page,1),page.locator('.brand'))
  expect((await stored(page)).slots).toEqual(before.slots)
  expect((await stored(page)).heroSlots).toEqual(before.heroSlots)
  // Occupied cross-inventory target is an exchange, not an extra item.
  const warehouse = await W(page,2).getAttribute('data-item-id')
  await drag(H(page,1),W(page,2))
  await expect(W(page,2)).toHaveAttribute('data-item-id',b!); await expect(H(page,1)).toHaveAttribute('data-item-id',warehouse!)
  await page.getByRole('button', {name:'準備完了・出発'}).click()
  const away = await stored(page)
  await drag(W(page,1),H(page,0))
  expect((await stored(page)).heroSlots).toEqual(away.heroSlots)
})

test('real touch scrolling before a hold works; held edge drag auto-scrolls without losing stock', async ({ page }) => {
  await page.setViewportSize({width:390,height:664})
  await page.goto('./')
  const region = page.locator('.inventory-scroll')
  const box = (await region.boundingBox())!
  const cdp = await page.context().newCDPSession(page)
  const x = box.x + box.width/2, y = box.y + box.height - 35
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]})
  for (let n=1;n<=7;n++) {
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-n*13,id:1}]})
    await page.waitForTimeout(15)
  }
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
  await expect.poll(()=>region.evaluate((e)=>e.scrollTop)).toBeGreaterThan(30)
  await expect(page.locator('.drag-ghost')).toHaveCount(0)
  await expect(stock(page)).toHaveCount(48)
  await region.evaluate((e)=>{e.scrollTop=0})
  await page.waitForTimeout(500)
  const from=await point(W(page,0))
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...from,id:1}]})
  await expect(page.locator('.drag-ghost')).toBeVisible()
  await expect(W(page,0)).toHaveClass(/drag-origin/)
  await expect(H(page,0)).toHaveClass(/drop-valid/)
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+50,y:box.y+box.height-10,id:1}]})
  await expect.poll(()=>region.evaluate((e)=>e.scrollTop)).toBeGreaterThan(100)
  // Cancel off-grid; auto-scroll and the floating preview must stop.
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]})
  await expect(page.locator('.drag-ghost')).toHaveCount(0)
  await expect(stock(page)).toHaveCount(48)
  const stopped=await region.evaluate((e)=>e.scrollTop)
  await page.waitForTimeout(100)
  expect(await region.evaluate((e)=>e.scrollTop)).toBe(stopped)
  await cdp.detach()
})

test('small screens keep touch targets, keyboard operation and warehouse space', async ({ page }) => {
  for (const viewport of [{width:320,height:568},{width:390,height:664},{width:1280,height:800}]) {
    await page.setViewportSize(viewport); await page.goto('./')
    await expect(page.locator('[data-area="warehouse"]')).toHaveCount(160)
    await expect(stock(page)).toHaveCount(48)
    const metrics=await page.evaluate(()=>({
      overflow:document.documentElement.scrollWidth>innerWidth,
      pageOverflow:document.documentElement.scrollHeight>innerHeight,
      height:document.querySelector('.inventory-scroll')!.clientHeight,
      touch:Array.from(document.querySelectorAll('.item-slot')).every((e)=>e.getBoundingClientRect().width>=44&&e.getBoundingClientRect().height>=44),
      actions:document.querySelector('.action-buttons')!.getBoundingClientRect().bottom<=innerHeight,
    }))
    expect(metrics).toMatchObject({overflow:false,pageOverflow:false,touch:true,actions:true})
    expect(metrics.height).toBeGreaterThanOrEqual(64)
  }
  await W(page,0).focus(); await page.keyboard.press('Enter')
  await expect(W(page,0)).toHaveAttribute('aria-pressed','true')
  await expect(page.getByRole('button',{name:'移動・交換'})).toBeEnabled()
  for (const kind of ['sword','shield','potion','staff','herb','helm','ether','boots']) {
    await expect(page.locator(`[data-area="warehouse"][data-kind="${kind}"] svg`).first()).toHaveAttribute('viewBox','0 0 16 16')
  }
})

test('version 1 partial progress gains empty capacity and persists as version 3', async ({ page }) => {
  const old=JSON.stringify({version:1,state:legacy.nextPartial})
  await page.addInitScript(({key,old})=>{if(!localStorage.getItem('fixture-loaded')){localStorage.setItem(key,old);localStorage.setItem('fixture-loaded','yes')}},{key,old})
  await page.goto('./')
  await expect(page.locator('.day-number')).toHaveText('2日目')
  const migrated=await stored(page)
  expect(migrated.slots.slice(0,96)).toEqual(legacy.nextPartial.slots)
  expect(migrated.slots.slice(96)).toEqual(Array(64).fill(null))
  expect(migrated.pendingIncoming).toEqual(legacy.nextPartial.pendingIncoming)
  expect(migrated.heroSlots.filter(Boolean)).toEqual(legacy.nextPartial.issuedByOrder['day-2'])
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('guild-keeper.save')!).version)).toBe(3)
  expect(await page.evaluate(()=>localStorage.getItem('guild-keeper.save.v1-backup'))).toBe(old)
  await page.reload()
  expect((await stored(page)).heroSlots).toEqual(migrated.heroSlots)
})

test('corrupt/future saves are preserved; reset requires confirmation and save failure warns', async ({ page }) => {
  for (const raw of ['{broken','{"version":999}']) {
    await page.goto('./'); await page.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key,raw}); await page.reload()
    await expect(page.getByRole('alert')).toContainText('自動保存を停止')
    expect(await page.evaluate((key)=>localStorage.getItem(key),key)).toBe(raw)
    page.once('dialog',(dialog)=>dialog.dismiss()); await page.getByRole('button',{name:'記録を初期化して始める'}).click()
    expect(await page.evaluate((key)=>localStorage.getItem(key),key)).toBe(raw)
    page.once('dialog',(dialog)=>dialog.accept()); await page.getByRole('button',{name:'記録を初期化して始める'}).click()
    await expect(stock(page)).toHaveCount(48)
  }
  const before=await stored(page)
  await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new DOMException('quota','QuotaExceededError')}})
  await W(page,0).click(); await page.getByRole('button',{name:'勇者へ渡す'}).click()
  await expect(page.locator('.save-tools summary')).toContainText('未保存の進行が失われます')
  await expect(stock(page)).toHaveCount(47); expect((await stored(page)).slots).toEqual(before.slots)
})

test('an open page counts down to ready without reload, and reset clears the saved adventure', async ({ page }) => {
  await page.clock.install({time:new Date('2026-10-22T15:00:00Z')})
  await page.addInitScript(()=>{Object.defineProperty(crypto,'getRandomValues',{value:(a:Uint32Array)=>{a.fill(0);return a}})})
  await page.goto('./')
  await page.getByRole('button',{name:'準備完了・出発'}).click()
  await expect(page.locator('.adventure-time')).toContainText('今回 1:00')
  await page.clock.runFor(15000)
  await expect(page.locator('.adventure-time')).toContainText('残り 0:45')
  await page.clock.runFor(45000)
  await expect(page.getByRole('button',{name:'帰還を迎える'})).toBeVisible()
  const saved=await stored(page)
  expect(saved.adventures[0].returned).toBeNull()
  await page.getByRole('button',{name:'帰還を迎える'}).click()
  await page.locator('.save-tools summary').click()
  page.once('dialog',(dialog)=>dialog.dismiss())
  await page.getByRole('button',{name:'記録を初期化',exact:true}).click()
  await expect(page.locator('[data-phase="returned"]')).toBeVisible()
  page.once('dialog',(dialog)=>dialog.accept())
  await page.getByRole('button',{name:'記録を初期化',exact:true}).click()
  await page.reload()
  await expect(page.locator('[data-phase="preparing"]')).toBeVisible()
  expect((await stored(page)).adventures[0].timing).toBeNull()
  await expect(stock(page)).toHaveCount(48)
})

test('version 2 capacity upgrade preserves an active adventure and makes the last empty slot usable', async ({ page, isMobile }) => {
  const now = new Date('2026-10-22T16:00:00Z').getTime()
  await page.clock.setFixedTime(now)
  const slots = structuredClone(legacy.initial.slots)
  const item = slots[0]; slots[0] = null
  const adventure = { id:'day-1', title:'旧冒険', message:'冒険中です。', issued:[item],
    timing:{startedAt:now-30000,durationMs:60000,returnAt:now+30000}, returned:null }
  const old = JSON.stringify({version:2,state:{slots,heroSlots:[item,...Array(7).fill(null)],day:1,adventures:[adventure],
    pendingIncoming:[],legacy:null,selection:null,moving:false,notice:''}})
  await page.addInitScript(({key,old})=>{if(!localStorage.getItem('v2-fixture')){localStorage.setItem(key,old);localStorage.setItem('v2-fixture','1')}},{key,old})
  await page.goto('./')
  await expect(page.locator('[data-area="warehouse"]')).toHaveCount(160)
  await expect(page.locator('.stock-count')).toContainText('/ 160 枠')
  await expect(page.locator('.adventure-time')).toContainText('残り 0:30')
  const migrated = await stored(page)
  expect(migrated.slots.slice(0,96)).toEqual(slots)
  expect(migrated.slots.slice(96)).toEqual(Array(64).fill(null))
  expect(migrated.heroSlots[0]).toEqual(item)
  expect(migrated.adventures[0]).toEqual(adventure)
  // Tap fallback can reach the final added cell, including on a phone.
  const activate=(l:Locator)=>isMobile?l.tap():l.click()
  const source = stock(page).first(), movedId = await source.getAttribute('data-item-id')
  await activate(source); await activate(page.getByRole('button',{name:'移動・交換'}))
  const last = page.locator('[data-area="warehouse"][data-slot="159"]')
  await activate(last)
  await expect(last).toHaveAttribute('data-item-id',movedId!)
  await page.reload()
  await expect(last).toHaveAttribute('data-item-id',movedId!)
  expect((await stored(page)).adventures[0].timing).toEqual(adventure.timing)
})
