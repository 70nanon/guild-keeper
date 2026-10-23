import { useEffect, useReducer, useRef, useState } from 'react'
import { ITEM_TYPES } from './game/data'
import type { Item } from './game/data'
import { canTransfer, currentAdventure, gameReducer, getSelectedItem, hasReturned, phase } from './game/game'
import type { Area, GameAction, Location } from './game/game'
import { loadGame, saveGame } from './game/save'
import { ItemIcon } from './ui/ItemIcon'
import { useItemDrag } from './ui/useItemDrag'
import { Modal } from './ui/Modal'
import { ReturnResults } from './ui/ReturnResults'
import { rememberTutorial, tutorialSeen } from './ui/preferences'
import './App.css'

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0]
const browserStorage = {
  getItem: (key: string) => window.localStorage.getItem(key),
  setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
}
const clockText = (milliseconds: number) => {
  const seconds = Math.ceil(Math.max(0, milliseconds) / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
type Panel = 'tutorial' | 'menu' | 'plan' | 'results' | null
function App() {
  const [loaded] = useState(() => loadGame(browserStorage))
  const [state, dispatch] = useReducer(gameReducer, loaded.state)
  const [blocked, setBlocked] = useState(loaded.blocked)
  const [saveMessage, setSaveMessage] = useState(loaded.message)
  const [panel, setPanel] = useState<Panel>(() => !tutorialSeen(browserStorage) ? 'tutorial' : hasReturned(loaded.state) ? 'results' : null)
  const [tutorialWarning, setTutorialWarning] = useState('')
  const resumeResult = useRef(hasReturned(loaded.state))
  const [departure, setDeparture] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [actionsOpen, setActionsOpen] = useState(false)
  const lastTap = useRef<{ id: string; area: Area; slot: number; time: number } | null>(null)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const update = () => setNow(Date.now())
    const interval = setInterval(update, 500)
    window.addEventListener('pageshow', update)
    document.addEventListener('visibilitychange', update)
    return () => { clearInterval(interval); window.removeEventListener('pageshow', update); document.removeEventListener('visibilitychange', update) }
  }, [])
  useEffect(() => {
    if (blocked) return
    try {
      saveGame(browserStorage, state)
      // oxlint-disable-next-line react/set-state-in-effect -- 外部ストレージとの同期結果を表示する。
      setSaveMessage('自動保存済み')
    } catch {
      setSaveMessage('保存できません。再読み込みすると未保存の進行が失われます。容量・設定を確認してください。')
    }
  }, [state, blocked])
  useEffect(() => {
    if (!departure) return
    const timer = setTimeout(() => setDeparture(null), 4500)
    return () => clearTimeout(timer)
  }, [departure])
  const adventure = currentAdventure(state)
  const status = phase(state, now)
  const selected = getSelectedItem(state)
  const editableHero = status === 'preparing' || status === 'returned'
  const drag = useItemDrag({
    adventureId: adventure.id,
    canDrop: (s, to) => canTransfer(state, s.from, to, s.item.id, s.adventureId),
    drop: (s, to) => dispatch({ type: 'transfer', from: s.from, to, itemId: s.item.id, adventureId: s.adventureId }),
  })
  // Leave the cell available for a second tap before showing its non-modal detail.
  const inspectId = selected && !state.moving && !drag.drag && !panel ? selected.id : null
  useEffect(() => {
    if (!inspectId) return
    const timer = setTimeout(() => { setDetailId(inspectId); setActionsOpen(false) }, 380)
    return () => clearTimeout(timer)
  }, [inspectId])
  const open = (next: Panel) => {
    drag.cancel(); lastTap.current = null
    if (next === 'tutorial') resumeResult.current = false
    setPanel(next)
  }
  const closeTutorial = () => {
    if (!rememberTutorial(browserStorage)) setTutorialWarning('操作案内の表示記録を保存できません。再読込時に再表示される場合があります。')
    else setTutorialWarning('')
    setPanel(resumeResult.current ? 'results' : null)
    resumeResult.current = false
  }
  const closePanel = () => panel === 'tutorial' ? closeTutorial() : setPanel(null)
  const act = (action: GameAction) => { lastTap.current = null; setDetailId(null); dispatch(action) }
  const depart = () => {
    // oxlint-disable-next-line react/purity -- onClickでのみ呼び、描画中には時刻を取得しない。
    const startedAt = Date.now()
    act({ type: 'depart', adventureId: adventure.id, now: startedAt, seed: randomSeed() })
    setDeparture(adventure.id)
  }
  const reset = () => {
    if (!window.confirm('保存中の記録を初期化し、1日目から始めますか？')) return
    drag.cancel(); act({ type: 'reset' }); setBlocked(false); setPanel(tutorialSeen(browserStorage) ? null : 'tutorial'); setDeparture(null); resumeResult.current = false
  }
  if (blocked) return <div className="recovery-panel">
    <h1>Guild Keeper</h1><p role="alert">{saveMessage}</p><p>既存の記録は上書きしていません。</p>
    <button className="secondary-button" onClick={() => window.location.reload()}>再読み込み</button>
    <button className="primary-button" onClick={reset}>記録を初期化して始める</button>
  </div>

  const cells = (items: readonly (Item | null)[], area: Area) => items.map((item, slot) => {
    const at: Location = { area, slot }
    const chosen = selected?.id === item?.id && !!item
    const movable = area !== 'hero' || editableHero
    const validDrop = drag.drag && canTransfer(state, drag.drag.from, at, drag.drag.item.id, drag.drag.adventureId)
    const tapTarget = state.moving && state.selection && canTransfer(state, state.selection.at, at, state.selection.itemId, adventure.id)
    const over = drag.drag?.over?.area === area && drag.drag.over.slot === slot
    const origin = drag.drag?.from.area === area && drag.drag.from.slot === slot
    const name = item ? `${ITEM_TYPES[item.kind].name}（${ITEM_TYPES[item.kind].category}）` : '空き枠'
    return <button key={slot} type="button"
      className={`item-slot ${item ? '' : 'is-empty'} ${chosen ? 'is-selected' : ''} ${validDrop || tapTarget ? 'drop-valid' : ''} ${over ? 'drop-over' : ''} ${origin ? 'drag-origin' : ''}`}
      data-area={area} data-slot={slot} data-item-id={item?.id} data-kind={item?.kind}
      aria-label={`${area === 'warehouse' ? '倉庫' : area === 'hero' ? '勇者' : '一時選別'}の枠${slot + 1}：${name}${area === 'hero' && !editableHero ? '・持ち物変更不可' : ''}`}
      aria-pressed={chosen} draggable={!!item && movable}
      onClick={(e) => {
        const previous = lastTap.current
        setDetailId(null)
        if (!item && !state.moving) { lastTap.current = null; dispatch({ type: 'cancel' }); return }
        if (item && e.detail !== 0 && previous?.id === item.id && previous.area === area && previous.slot === slot && performance.now() - previous.time < 350 && !state.moving) {
          lastTap.current = null
          dispatch({ type: 'quick', from: at, itemId: item.id, adventureId: adventure.id })
        } else {
          lastTap.current = item && e.detail !== 0 ? { id: item.id, area, slot, time: performance.now() } : null
          dispatch({ type: 'select', at })
        }
      }}
      onDragStart={(e) => { lastTap.current = null; return item && movable ? drag.startMouse(e, at, item) : e.preventDefault() }}
      onDragEnd={drag.cancel}
      onTouchStart={(e) => { if (item && movable) drag.startTouch(e, at, item) }}
      onContextMenu={(e) => e.preventDefault()}>
      {item ? <ItemIcon kind={item.kind} className="item-icon" /> : <span className="empty-mark" aria-hidden="true">·</span>}
      {chosen && <span className="selected-mark" aria-hidden="true">✓</span>}
    </button>
  })
  const stock = state.slots.filter(Boolean).length
  const heroCount = state.heroSlots.filter(Boolean).length
  const detailsVisible = inspectId && detailId === inspectId
  return <div className={`app-shell ${drag.drag ? 'is-dragging' : ''} ${state.moving ? 'is-moving' : ''}`}
    onDragOver={drag.overMouse} onDrop={drag.dropMouse}
    onClickCapture={(e) => {
      if (!(e.target as Element).closest('.item-slot')) lastTap.current = null
      if (e.detail && (e.target as Element).closest('.item-slot') && drag.suppressClick()) { e.preventDefault(); e.stopPropagation() }
    }}>
    <header className="site-header">
      <button className="icon-button menu-toggle" aria-label="メニューを開く" onClick={() => open('menu')}>☰</button>
      <h1>Guild Keeper</h1>
      <button className="icon-button" aria-label="操作案内を開く" onClick={() => open('tutorial')}>?</button>
    </header>
    <main className="workspace">
      <section className="adventure-strip" aria-label="冒険予定">
        <button className="plan-toggle" aria-expanded={panel === 'plan'} onClick={() => open('plan')}>
          <span>{state.day}日目 · {adventure.title}</span><small>{status === 'preparing' ? '支度中' : status === 'returned' ? '帰還済み' : status === 'ready' ? '帰還可能' : '冒険中'} · {adventure.message.split('。')[0]}</small>
        </button>
        <div className="adventure-controls" data-phase={status}>
          {status === 'preparing' && <button className="primary-button" onClick={depart}>出発</button>}
          {(status === 'away' || status === 'ready') && <><p className="adventure-time">今回 {clockText(adventure.timing!.durationMs)}<br />残り <strong>{clockText(adventure.timing!.returnAt - now)}</strong></p>
            {status === 'ready' && <button className="primary-button" onClick={() => {
              act({ type: 'return', adventureId: adventure.id, now: Date.now(), seed: randomSeed() }); setDeparture(null); open('results')
            }}>帰還を迎える</button>}</>}
          {status === 'returned' && <><button className="secondary-button" onClick={() => open('results')}>リザルト</button>
            <button className="primary-button" onClick={() => act({ type: 'next', adventureId: adventure.id })}>翌日へ</button></>}
        </div>
      </section>
      <section className="hero-panel" data-scroll-area aria-labelledby="hero-title">
        <div className="inventory-heading"><h2 id="hero-title">勇者の持ち物</h2><span className="hero-count" aria-label={`勇者の持ち物 ${heroCount}/8`}>{heroCount}/8</span></div>
        <div className={`hero-grid inventory-grid ${!editableHero ? 'hero-locked' : ''}`} aria-label="勇者のインベントリ">{cells(state.heroSlots, 'hero')}</div>
        {state.pendingIncoming.length > 0 && <details className="sorting-panel"><summary>一時選別 {state.pendingIncoming.length}</summary>
          <div className="sorting-scroll" data-scroll-area><div className="inventory-grid">{cells(state.pendingIncoming, 'sorting')}</div></div>
        </details>}
      </section>
      <section className="warehouse" aria-labelledby="warehouse-title">
        <div className="inventory-heading warehouse-heading"><h2 id="warehouse-title">はじまりの倉庫</h2><span className="stock-count" aria-label={`倉庫 ${stock}/${state.slots.length}`}>{stock}/{state.slots.length}</span></div>
        <div className="inventory-scroll" data-scroll-area role="region" aria-label="倉庫のアイテム一覧" tabIndex={0}>
          <div className="inventory-grid">{cells(state.slots, 'warehouse')}</div>
        </div>
      </section>
    </main>
    {detailsVisible && selected && <section className="item-detail" aria-label="アイテムの詳細">
      <div className="detail-heading"><ItemIcon kind={selected.kind} className="item-icon" /><div><strong>{ITEM_TYPES[selected.kind].name}</strong><small>{ITEM_TYPES[selected.kind].category}</small></div>
        <button className="icon-button" aria-label="詳細を閉じる" onClick={() => act({ type: 'cancel' })}>×</button></div>
      <button className="secondary-button" aria-expanded={actionsOpen} onClick={() => setActionsOpen(!actionsOpen)}>操作</button>
      {actionsOpen && <div className="context-actions">
        <button className="secondary-button" disabled={state.selection?.at.area === 'hero' && !editableHero} onClick={() => act({ type: 'move' })}>移動・交換</button>
        <button className="primary-button" onClick={() => state.selection && act({ type: 'quick', from: state.selection.at, itemId: selected.id, adventureId: adventure.id })}>{state.selection?.at.area === 'warehouse' ? '勇者へ渡す' : '倉庫へ戻す'}</button>
      </div>}
    </section>}
    {state.moving && !panel && <div className="move-feedback" role="status">移動先を選択<button className="icon-button" aria-label="移動をキャンセル" onClick={() => act({ type: 'cancel' })}>×</button></div>}
    {state.feedback === 'error' && panel !== 'results' && <div className="error-toast" role="alert">{state.notice}<button className="icon-button" aria-label="エラーを閉じる" onClick={() => act({ type: 'cancel' })}>×</button></div>}
    {saveMessage.startsWith('保存できません') && <p className="save-warning" role="alert">保存失敗 · メニューで確認</p>}
    {tutorialWarning && <p className="save-warning" role="alert">{tutorialWarning}</p>}
    {departure === adventure.id && adventure.timing && !hasReturned(state) && <aside className="departure-toast" role="status" aria-label="出発の演出">
      <span>「行ってくる！ 倉庫は任せた！」<small>{clockText(adventure.timing.durationMs)}ほどで戻る予定</small></span>
      <button className="icon-button" aria-label="出発の演出を閉じる" onClick={() => setDeparture(null)}>×</button>
    </aside>}
    {panel && <Modal title={panel === 'menu' ? '倉庫の帳簿' : panel === 'tutorial' ? '倉庫番の手引き' : panel === 'results' ? '帰還リザルト' : adventure.title} side={panel === 'menu'} close={closePanel}>
      {panel === 'menu' && <><p className="save-message">{saveMessage}</p><button className="secondary-button" onClick={reset}>記録を初期化</button></>}
      {panel === 'plan' && <p>{adventure.message}</p>}
      {panel === 'tutorial' && <div className="tutorial">
        <p>勇者の支度を整え、留守の間に倉庫を整理しましょう。</p>
        <ul><li>PCはドラッグ、スマホは長押しして運びます。倉庫内は重ねると交換。</li><li>ダブルクリック／ダブルタップで勇者へ支給・倉庫へ返却。</li><li>1回タップすると品の詳細が開きます。「操作」からタップだけでも移動できます。</li><li>帰還後はリザルトで入庫品を選びます。残りは勇者が持ち越します。</li></ul>
        <button className="primary-button" onClick={closeTutorial}>はじめる</button>
      </div>}
      {panel === 'results' && <ReturnResults state={state} dispatch={dispatch} seed={randomSeed} />}
    </Modal>}
    {drag.drag?.mode === 'touch' && <div className="drag-ghost" aria-hidden="true" style={{ left: drag.drag.x, top: drag.drag.y }}><ItemIcon kind={drag.drag.item.kind} className="item-icon" /></div>}
  </div>
}
export default App
