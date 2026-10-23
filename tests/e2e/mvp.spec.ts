import { test, expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
const key = 'guild-keeper.save'
const legacy = JSON.parse(readFileSync(new URL('../fixtures/version1.json', import.meta.url), 'utf8'))
const W = (page: Page, n: number) => page.locator(`[data-area="warehouse"][data-slot="${n}"]`)
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

const tutorialKey = 'guild-keeper.tutorial.v1'
test.beforeEach(async ({page}, testInfo)=>{
  if (!testInfo.title.startsWith('first tutorial')) await page.addInitScript((key)=>localStorage.setItem(key,'seen'),tutorialKey)
})
async function command(page:Page,name:string){
  await expect(page.getByRole('region',{name:'アイテムの詳細'})).toBeVisible()
  await page.getByRole('button',{name:'操作',exact:true}).click()
  await page.getByRole('button',{name,exact:true}).click()
}
async function closeResults(page:Page){
  await page.getByRole('button',{name:'帰還リザルトを閉じる'}).click()
}
async function fixture(page:Page,state:unknown,version=4){
  await page.goto('./')
  await page.evaluate(({key,state,version})=>localStorage.setItem(key,JSON.stringify({version,state})),{key,state,version})
  await page.reload()
}

test('compact screens use identical icon-only cells, packed stock, details and no permanent controls',async({page},testInfo)=>{
  for(const viewport of [{width:320,height:568},{width:390,height:664},{width:1280,height:800}]){
    await page.setViewportSize(viewport);await page.goto('./')
    await expect(stock(page)).toHaveCount(48)
    await expect(page.locator('.stock-count')).toHaveText('48/160')
    await expect(page.locator('.hero-count')).toHaveText('0/8')
    await expect(page.getByRole('button',{name:'移動・交換'})).toHaveCount(0)
    await expect(page.getByRole('button',{name:'勇者へ渡す'})).toHaveCount(0)
    await expect(page.locator('.notice,.item-name,.action-panel')).toHaveCount(0)
    const metrics=await page.evaluate(()=>{
      const slots=Array.from(document.querySelectorAll('.item-slot'))
      const sizes=slots.map(e=>{const r=e.getBoundingClientRect();return `${r.width},${r.height}`})
      const icons=Array.from(document.querySelectorAll('.item-slot svg')).map(e=>{const r=e.getBoundingClientRect();return `${r.width},${r.height}`})
      return {width:document.documentElement.scrollWidth<=innerWidth,height:document.documentElement.scrollHeight<=innerHeight,
        sizes:[...new Set(sizes)],icons:[...new Set(icons)],targets:slots.every(e=>e.clientWidth>=44&&e.clientHeight>=44),region:document.querySelector('.inventory-scroll')!.clientHeight,
        names:slots.filter(e=>e.textContent!.replace(/[·✓]/g,'').trim()).length}
    })
    expect(metrics).toMatchObject({width:true,height:true,targets:true,names:0})
    expect(metrics.sizes).toHaveLength(1);expect(metrics.icons).toHaveLength(1);expect(metrics.region).toBeGreaterThan(100)
    const saved=await stored(page);expect(saved.slots.slice(0,48).every(Boolean)).toBeTruthy();expect(saved.slots.slice(48).every((i:unknown)=>i===null)).toBeTruthy()
    await W(page,0).focus();await page.keyboard.press('Enter')
    await expect(page.getByRole('region',{name:'アイテムの詳細'})).toBeVisible()
    await expect(W(page,0)).toHaveAttribute('aria-pressed','true')
    await page.getByRole('button',{name:'詳細を閉じる'}).click()
    if(viewport.width === (testInfo.project.name === 'mobile' ? 390 : 1280)) await page.screenshot({path:`test-results/compact-${testInfo.project.name}.png`})
  }
})

test('double click/tap gives and returns; singles inspect without moving',async({page,isMobile})=>{
  await page.goto('./')
  const activate=(l:Locator)=>isMobile?l.tap():l.click()
  const a=await W(page,0).getAttribute('data-item-id')
  await activate(W(page,0));await expect(stock(page)).toHaveCount(48)
  await expect(page.getByRole('region',{name:'アイテムの詳細'})).toBeVisible()
  await page.getByRole('button',{name:'詳細を閉じる'}).click()
  if(isMobile){await W(page,0).tap();await W(page,0).tap()}else await W(page,0).dblclick()
  await expect(H(page,0)).toHaveAttribute('data-item-id',a!)
  if(isMobile){await H(page,0).tap();await H(page,0).tap()}else await H(page,0).dblclick()
  await expect(W(page,0)).toHaveAttribute('data-item-id',a!)
  await expect(page.getByRole('region',{name:'アイテムの詳細'})).toHaveCount(0)
})

test('tap-only alternative, timed adventures, selected results and four daily loops persist safely',async({page,isMobile},testInfo)=>{
  const activate=(l:Locator)=>isMobile?l.tap():l.click()
  let now=new Date('2026-10-23T12:00:00Z').getTime()
  await page.clock.setFixedTime(now);await page.goto('./')
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
  for(let day=1;day<=4;day++){
    await expect(page.locator('.plan-toggle span')).toContainText(`${day}日目`)
    const selectedStock=stock(page).first()
    await activate(selectedStock);await command(page,'勇者へ渡す')
    await activate(stock(page).first());await command(page,'移動・交換');await activate(H(page,1))
    await activate(page.getByRole('button',{name:'出発',exact:true}))
    await expect(page.getByRole('status',{name:'出発の演出'})).toBeVisible()
    const away=await stored(page), a=away.adventures.at(-1)
    expect(a.timing.startedAt).toBe(now)
    expect(a.timing.durationMs).toBeGreaterThanOrEqual(60000);expect(a.timing.durationMs).toBeLessThanOrEqual(180000)
    await page.getByRole('button',{name:'出発の演出を閉じる'}).click()
    await activate(H(page,0));await command(page,'倉庫へ戻す')
    await expect(page.getByRole('alert')).toContainText('冒険中')
    await page.getByRole('button',{name:'エラーを閉じる'}).click()
    const [left,right]=await stock(page).all();const l=await left.getAttribute('data-item-id'),r=await right.getAttribute('data-item-id')
    await activate(left);await command(page,'移動・交換');await activate(right)
    await expect(left).toHaveAttribute('data-item-id',r!);await expect(right).toHaveAttribute('data-item-id',l!)
    const sorted=await stored(page)
    now=a.timing.returnAt-30000;await page.clock.setFixedTime(now);await page.reload()
    await expect(page.locator('.adventure-time')).toContainText('残り 0:30')
    expect((await stored(page)).slots).toEqual(sorted.slots)
    now=a.timing.returnAt+1000;await page.clock.setFixedTime(now);await page.reload()
    await activate(page.getByRole('button',{name:'帰還を迎える'}))
    await expect(page.getByRole('dialog',{name:'帰還リザルト'})).toBeVisible()
    const returned=await stored(page)
    expect(returned.slots).toEqual(sorted.slots)
    await page.getByRole('checkbox').first().check()
    await page.reload();await expect(page.getByRole('checkbox').first()).toBeChecked()
    const checks=await page.getByRole('checkbox').all();for(const check of checks)await check.check()
    await page.getByRole('button',{name:'選択品を入庫'}).click()
    if(day===1)await page.screenshot({path:`test-results/result-${testInfo.project.name}.png`})
    const admitted=await stored(page)
    await closeResults(page);await page.getByRole('button',{name:'リザルト',exact:true}).click()
    expect((await stored(page)).slots).toEqual(admitted.slots)
    await expect(page.getByRole('button',{name:'選択品を入庫'})).toBeDisabled()
    await closeResults(page)
    await activate(page.getByRole('button',{name:'翌日へ',exact:true}))
    expect((await stored(page)).slots).toEqual(admitted.slots)
    const all=[...admitted.slots,...admitted.heroSlots,...admitted.pendingIncoming].filter(Boolean)
    expect(new Set(all.map((i:{id:string})=>i.id)).size).toBe(all.length)
    now+=1000;await page.clock.setFixedTime(now)
  }
  expect((await stored(page)).day).toBe(5);expect(errors).toEqual([])
})

test('native mouse or long touch drag moves, swaps, gives, returns, rejects occupied targets and cancels',async({page,isMobile})=>{
  await page.goto('./')
  const drag=(from:Locator,to:Locator)=>isMobile?touchDrag(page,from,to):from.dragTo(to)
  const a=await W(page,0).getAttribute('data-item-id'),b=await W(page,1).getAttribute('data-item-id')
  await drag(W(page,0),W(page,1));await expect(W(page,0)).toHaveAttribute('data-item-id',b!)
  await drag(W(page,1),H(page,0));await expect(H(page,0)).toHaveAttribute('data-item-id',a!)
  await drag(W(page,0),W(page,1));await expect(W(page,1)).toHaveAttribute('data-item-id',b!)
  await drag(H(page,0),W(page,0));await expect(W(page,0)).toHaveAttribute('data-item-id',a!)
  await drag(W(page,1),H(page,0));const before=await stored(page)
  await drag(H(page,0),W(page,2));await expect(page.getByRole('alert')).toContainText('空き枠')
  expect((await stored(page)).heroSlots).toEqual(before.heroSlots)
  await page.getByRole('button',{name:'エラーを閉じる'}).click()
  await drag(W(page,2),page.locator('h1'));expect((await stored(page)).slots).toEqual(before.slots)
  await page.getByRole('button',{name:'出発',exact:true}).click()
  await page.getByRole('button',{name:'出発の演出を閉じる'}).click()
  await drag(W(page,2),H(page,1));expect((await stored(page)).heroSlots).toEqual(before.heroSlots)
})

test('normal touch scrolling before hold and held edge auto-scroll keep inventory unchanged',async({page})=>{
  await page.setViewportSize({width:390,height:664});await page.goto('./')
  const region=page.locator('.inventory-scroll'),box=(await region.boundingBox())!
  const cdp=await page.context().newCDPSession(page),x=box.x+box.width/2,y=box.y+box.height-35
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]})
  for(let n=1;n<=7;n++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-n*13,id:1}]});await page.waitForTimeout(15)}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
  await expect.poll(()=>region.evaluate(e=>e.scrollTop)).toBeGreaterThan(30)
  await expect(page.locator('.drag-ghost')).toHaveCount(0)
  await region.evaluate(e=>{e.scrollTop=0});await page.waitForTimeout(500)
  const from=await point(W(page,0))
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...from,id:1}]})
  await expect(page.locator('.drag-ghost')).toBeVisible();await expect(H(page,0)).toHaveClass(/drop-valid/)
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+50,y:box.y+box.height-10,id:1}]})
  await expect.poll(()=>region.evaluate(e=>e.scrollTop)).toBeGreaterThan(100)
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]})
  await expect(page.locator('.drag-ghost')).toHaveCount(0);await expect(stock(page)).toHaveCount(48)
  await cdp.detach()
})

test('first tutorial closes and stays dismissed across reload and reset; help can reopen it',async({page},testInfo)=>{
  await page.goto('./');await expect(page.getByRole('dialog',{name:'倉庫番の手引き'})).toBeVisible()
  await page.screenshot({path:`test-results/tutorial-${testInfo.project.name}.png`})
  await page.getByRole('button',{name:'倉庫番の手引きを閉じる'}).click();await page.reload()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await page.evaluate(key=>localStorage.getItem(key),tutorialKey)).toBe('seen')
  await page.getByRole('button',{name:'操作案内を開く'}).click()
  await expect(page.getByRole('dialog',{name:'倉庫番の手引き'})).toBeVisible()
  await page.getByRole('button',{name:'はじめる'}).click()
  await page.getByRole('button',{name:'メニューを開く'}).click()
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'記録を初期化',exact:true}).click()
  await page.reload();await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('departure presentation dismisses automatically without re-rolling time or cargo',async({page},testInfo)=>{
  await page.clock.install({time:new Date('2026-10-23T15:00:00Z')})
  await page.addInitScript(()=>{Object.defineProperty(crypto,'getRandomValues',{value:(a:Uint32Array)=>{a.fill(0);return a}})})
  await page.goto('./')
  await page.locator('[data-area="warehouse"][data-kind="potion"]').first().dblclick()
  await page.locator('[data-area="warehouse"][data-kind="sword"]').first().dblclick()
  await page.getByRole('button',{name:'出発',exact:true}).click()
  const away=await stored(page)
  await expect(page.getByRole('status',{name:'出発の演出'})).toContainText('1:00')
  await page.screenshot({path:`test-results/departure-${testInfo.project.name}.png`})
  await page.clock.runFor(4500);await expect(page.getByRole('status',{name:'出発の演出'})).toHaveCount(0)
  await page.reload();expect((await stored(page)).adventures).toEqual(away.adventures)
  await expect(page.getByRole('status',{name:'出発の演出'})).toHaveCount(0)
  await page.clock.runFor(55500)
  await page.getByRole('button',{name:'帰還を迎える'}).click()
  await expect(page.getByRole('dialog',{name:'帰還リザルト'})).toBeVisible()
  await expect(page.locator('.receipt-counts')).toContainText('返却 1')
  await expect(page.locator('.receipt-counts')).toContainText('使用 1')
  await page.getByText('使用した消耗品（1）').click()
  await expect(page.locator('.consumed-items li')).toHaveText('回復薬')
  const returned=await stored(page);await closeResults(page)
  await page.getByRole('button',{name:'リザルト',exact:true}).click()
  expect((await stored(page)).adventures).toEqual(returned.adventures)
})

test('full warehouse allows closing results, freeing space, and re-selecting without lost items',async({page})=>{
  const {createGame,gameReducer,currentAdventure}=await import('../../src/game/game.ts')
  let s=createGame()
  const id=()=>currentAdventure(s).id
  const cycle=()=>{s=gameReducer(s,{type:'depart',adventureId:id(),now:1000000,seed:0});s=gameReducer(s,{type:'return',adventureId:id(),now:1060000,seed:1500})}
  for(let n=0;n<28;n++){
    cycle();for(const i of s.heroSlots)if(i)s=gameReducer(s,{type:'intake-toggle',itemId:i.id})
    s=gameReducer(s,{type:'receive',seed:1});s=gameReducer(s,{type:'next',adventureId:id()})
  }
  cycle();await fixture(page,s)
  await expect(page.getByRole('dialog',{name:'帰還リザルト'})).toBeVisible()
  await expect(page.locator('.intake-summary')).toContainText('空き 0 / 選択 0')
  await page.getByRole('checkbox').first().check();await page.getByRole('button',{name:'選択品を入庫'}).click()
  await expect(page.getByRole('alert')).toContainText('空きが足りません')
  expect((await stored(page)).heroSlots).toEqual(s.heroSlots)
  await closeResults(page)
  await stock(page).first().click();await command(page,'勇者へ渡す')
  await page.getByRole('button',{name:'リザルト',exact:true}).click()
  await expect(page.locator('.intake-summary')).toContainText('空き 1 / 選択 1')
  await page.getByRole('button',{name:'選択品を入庫'}).click()
  const received=await stored(page)
  await page.reload();expect((await stored(page)).slots).toEqual(received.slots)
  await expect(page.getByRole('button',{name:'選択品を入庫'})).toBeDisabled()
  await closeResults(page);await page.getByRole('button',{name:'翌日へ',exact:true}).click();await page.reload()
  expect((await stored(page)).heroSlots).toEqual(received.heroSlots)
})

test('results distinguish equipment, loot and consumed supplies and preserve overflow and selected checks',async({page},testInfo)=>{
  const {createGame,gameReducer,currentAdventure}=await import('../../src/game/game.ts')
  let s=createGame()
  for(let n=0;n<8;n++){
    const slot=s.slots.findIndex(i=>i?.kind==='sword'||i?.kind==='shield'),item=s.slots[slot]!
    s=gameReducer(s,{type:'transfer',from:{area:'warehouse',slot},to:{area:'hero',slot:n},itemId:item.id,adventureId:'day-1'})
  }
  s=gameReducer(s,{type:'depart',adventureId:'day-1',now:1000000,seed:0})
  s=gameReducer(s,{type:'return',adventureId:'day-1',now:1060000,seed:1500})
  await fixture(page,s)
  await expect(page.locator('.receipt-counts')).toHaveText('返却 8 · 戦利品 4 · 使用 0')
  await expect(page.getByRole('checkbox')).toHaveCount(12)
  await page.getByRole('checkbox').nth(0).check();await page.getByRole('checkbox').nth(8).check()
  await page.reload();await expect(page.getByRole('checkbox').nth(0)).toBeChecked();await expect(page.getByRole('checkbox').nth(8)).toBeChecked()
  await page.getByRole('button',{name:'選択品を入庫'}).click()
  await expect(page.getByRole('checkbox').nth(0)).toBeDisabled();await expect(page.getByRole('checkbox').nth(8)).toBeDisabled()
  const received=await stored(page);expect(received.pendingIncoming).toHaveLength(3)
  await page.screenshot({path:`test-results/overflow-${testInfo.project.name}.png`})
  await closeResults(page);await page.getByRole('button',{name:'翌日へ',exact:true}).click()
  expect((await stored(page)).heroSlots).toEqual(received.heroSlots)
  await page.getByRole('button',{name:'出発',exact:true}).click()
  const away=await stored(page)
  expect(away.adventures.at(-1).issued).toEqual(received.heroSlots.filter(Boolean))
  await page.clock.setFixedTime(currentAdventure(away).timing!.returnAt+1000);await page.reload()
  await page.getByRole('button',{name:'帰還を迎える'}).click();await page.reload()
  const returned=await stored(page),all=[...returned.slots,...returned.heroSlots,...returned.pendingIncoming].filter(Boolean)
  expect(new Set(all.map((i:{id:string})=>i.id)).size).toBe(all.length)
})

test('legacy saves preserve layout, timing and backup instead of packing existing items',async({page})=>{
  await fixture(page,legacy.nextPartial,1)
  const migrated=await stored(page)
  expect(migrated.slots.slice(0,96)).toEqual(legacy.nextPartial.slots)
  expect(migrated.pendingIncoming).toEqual(legacy.nextPartial.pendingIncoming)
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('guild-keeper.save')!).version)).toBe(4)
  expect(await page.evaluate(()=>localStorage.getItem('guild-keeper.save.v1-backup'))).toBe(JSON.stringify({version:1,state:legacy.nextPartial}))
  const now=new Date('2026-10-23T16:00:00Z').getTime();await page.clock.setFixedTime(now)
  const slots=structuredClone(legacy.initial.slots),item=slots[0];slots[0]=null
  const adventure={id:'day-1',title:'旧冒険',message:'冒険中',issued:[item],timing:{startedAt:now-30000,durationMs:60000,returnAt:now+30000},returned:null}
  await fixture(page,{slots,heroSlots:[item,...Array(7).fill(null)],day:1,adventures:[adventure],pendingIncoming:[],legacy:null,selection:null,moving:false,notice:''},2)
  const resumed=await stored(page)
  expect(resumed.slots.slice(0,96)).toEqual(slots);expect(resumed.slots.slice(96)).toEqual(Array(64).fill(null))
  await expect(page.locator('.adventure-time')).toContainText('残り 0:30')
  expect(resumed.adventures[0]).toEqual(adventure)
  await stock(page).first().click();await command(page,'移動・交換');await W(page,159).click();await page.reload()
  expect((await stored(page)).slots[159]).not.toBeNull()
})

test('corrupt saves, storage failures and reset confirmations protect the previous record',async({page})=>{
  for(const raw of ['{broken','{"version":999}']){
    await page.goto('./');await page.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key,raw});await page.reload()
    await expect(page.getByRole('alert')).toContainText('自動保存を停止')
    page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'記録を初期化して始める'}).click()
    expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBe(raw)
    page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'記録を初期化して始める'}).click()
    await expect(stock(page)).toHaveCount(48)
  }
  const before=await stored(page)
  await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new DOMException('quota','QuotaExceededError')}})
  await W(page,0).click();await command(page,'勇者へ渡す')
  await expect(page.getByRole('alert')).toContainText('保存失敗')
  await page.getByRole('button',{name:'メニューを開く'}).click()
  await expect(page.locator('.save-message')).toContainText('未保存の進行が失われます')
  expect((await stored(page)).slots).toEqual(before.slots)
})

test('plan and minimal menu overlays close via keyboard without triggering inventory actions',async({page},testInfo)=>{
  await page.goto('./');await page.locator('.plan-toggle').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('dialog')).toContainText('今日は村の先の街道')
  await page.screenshot({path:`test-results/plan-${testInfo.project.name}.png`})
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button',{name:'メニューを開く'}).click()
  await expect(page.getByRole('dialog')).toContainText('自動保存済み')
  await expect(page.getByRole('dialog').getByRole('button')).toHaveCount(2)
  page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'記録を初期化',exact:true}).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape');await expect(stock(page)).toHaveCount(48)
})


test('version 4 sparse stock stays arranged until a confirmed new game packs it',async({page})=>{
  const {createGame}=await import('../../src/game/game.ts')
  const s=createGame(),items=s.slots.filter(Boolean),slots=Array(160).fill(null)
  items.forEach((i,n)=>{slots[Math.floor(n*160/48)]=i})
  await fixture(page,{...s,slots})
  expect((await stored(page)).slots).toEqual(slots)
  await page.reload();expect((await stored(page)).slots).toEqual(slots)
  await page.getByRole('button',{name:'メニューを開く'}).click()
  page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'記録を初期化',exact:true}).click()
  expect((await stored(page)).slots).toEqual(slots)
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'記録を初期化',exact:true}).click()
  const reset=await stored(page)
  expect(reset.slots.slice(0,48).every(Boolean)).toBeTruthy();expect(reset.slots.slice(48).every((i:unknown)=>i===null)).toBeTruthy()
})
