import { useEffect, useReducer, useState } from 'react'
import { ITEM_TYPES } from './game/data'
import type { Item } from './game/data'
import { canTransfer, currentAdventure, gameReducer, getSelectedItem, hasReturned, phase } from './game/game'
import type { Area, Location } from './game/game'
import { loadGame, saveGame } from './game/save'
import { ItemIcon } from './ui/ItemIcon'
import { useItemDrag } from './ui/useItemDrag'
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
function App() {
  const [loaded] = useState(() => loadGame(browserStorage))
  const [state, dispatch] = useReducer(gameReducer, loaded.state)
  const [blocked, setBlocked] = useState(loaded.blocked)
  const [saveMessage, setSaveMessage] = useState(loaded.message)
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
      setSaveMessage('自動保存済み・このブラウザに記録')
    } catch {
      setSaveMessage('保存できません。再読み込みすると未保存の進行が失われます。容量・設定を確認してください。')
    }
  }, [state, blocked])
  const adventure = currentAdventure(state)
  const status = phase(state, now)
  const selected = getSelectedItem(state)
  const editableHero = status === 'preparing'
  const drag = useItemDrag({
    adventureId: adventure.id,
    canDrop: (s, to) => canTransfer(state, s.from, to, s.item.id, s.adventureId),
    drop: (s, to) => dispatch({ type: 'transfer', from: s.from, to, itemId: s.item.id, adventureId: s.adventureId }),
  })
  const reset = () => {
    if (!window.confirm('保存中の記録を初期化し、1日目から始めますか？')) return
    drag.cancel(); dispatch({ type: 'reset' }); setBlocked(false)
  }
  if (blocked) return <div className="recovery-panel">
    <h1>Guild Keeper</h1><p role="alert">{saveMessage}</p><p>既存の記録は上書きしていません。</p>
    <button className="secondary-button" onClick={() => window.location.reload()}>再読み込み</button>
    <button className="primary-button" onClick={reset}>記録を初期化して始める</button>
  </div>

  const cells = (items: readonly (Item | null)[], area: Area) => items.map((item, slot) => {
    const at: Location = { area, slot }
    const chosen = selected?.id === item?.id && !!item
    const movable = area === 'warehouse' || editableHero
    const validDrop = drag.drag && canTransfer(state, drag.drag.from, at, drag.drag.item.id, drag.drag.adventureId)
    const tapTarget = state.moving && state.selection && canTransfer(state, state.selection.at, at, state.selection.itemId, adventure.id)
    const over = drag.drag?.over?.area === area && drag.drag.over.slot === slot
    const origin = drag.drag?.from.area === area && drag.drag.from.slot === slot
    const name = item ? `${ITEM_TYPES[item.kind].name}（${ITEM_TYPES[item.kind].category}）` : '空き枠'
    return <button key={slot} type="button"
      className={`item-slot ${item ? '' : 'is-empty'} ${chosen ? 'is-selected' : ''} ${validDrop || tapTarget ? 'drop-valid' : ''} ${over ? 'drop-over' : ''} ${origin ? 'drag-origin' : ''}`}
      data-area={area} data-slot={slot} data-item-id={item?.id} data-kind={item?.kind}
      aria-label={`${area === 'warehouse' ? '倉庫' : '勇者'}の枠${slot + 1}：${name}${area === 'hero' && !editableHero ? '・持ち物変更不可' : ''}`}
      aria-pressed={chosen} draggable={!!item && movable}
      onClick={() => dispatch({ type: 'select', at })}
      onDragStart={(e) => item && movable ? drag.startMouse(e, at, item) : e.preventDefault()}
      onDragEnd={drag.cancel}
      onTouchStart={(e) => { if (item && movable) drag.startTouch(e, at, item) }}
      onContextMenu={(e) => e.preventDefault()}>
      {item ? <><ItemIcon kind={item.kind} className="item-icon" /><span className="item-name">{ITEM_TYPES[item.kind].name}</span></>
        : <span className="empty-mark" aria-hidden="true">·</span>}
      {chosen && <span className="selected-mark" aria-hidden="true">✓</span>}
    </button>
  })
  const report = state.adventures.findLast((a) => a.returned)?.returned?.report ?? state.legacy?.lastReturn
  const heroCount = state.heroSlots.filter(Boolean).length
  const stock = state.slots.filter(Boolean).length
  const destination: Location | null = state.selection?.at.area === 'warehouse'
    ? { area: 'hero', slot: state.heroSlots.findIndex((i) => i === null) }
    : { area: 'warehouse', slot: state.slots.findIndex((i) => i === null) }
  const canQuickMove = selected && state.selection && destination
    && canTransfer(state, state.selection.at, destination, selected.id, adventure.id)

  return <div className={`app-shell ${drag.drag ? 'is-dragging' : ''}`}
    onDragOver={drag.overMouse} onDrop={drag.dropMouse}
    onClickCapture={(e) => {
      if (e.detail && (e.target as Element).closest('.item-slot') && drag.suppressClick()) { e.preventDefault(); e.stopPropagation() }
    }}>
    <header className="site-header">
      <div className="brand"><span className="brand-mark" aria-hidden="true">▤</span><h1>Guild Keeper</h1></div>
      <span className="version">勇者にはならない。勇者を倉庫から支える。<span>基本ループ試遊版</span></span>
    </header>
    <main className="workspace">
      <aside className="order-panel" aria-labelledby="adventure-title" data-scroll-area>
        <div className="order-heading"><span className="eyebrow">勇者 アレンの冒険帳</span><span className="day-number">{state.day}日目</span></div>
        <h2 id="adventure-title">{adventure.title}</h2>
        <p className="adventure-message">{adventure.message}</p>
        {status !== 'returned' && <>
          <div className="hero-heading"><h3>勇者の持ち物</h3><span>{heroCount} / {state.heroSlots.length} 枠</span></div>
          <div className={`hero-grid ${!editableHero ? 'hero-locked' : ''}`} aria-label="勇者のインベントリ">{cells(state.heroSlots, 'hero')}</div>
        </>}
        <div className="adventure-controls" data-phase={status}>
          {status === 'preparing' && <><p>好きな品を準備。出発前なら戻せます。</p>
            <button className="primary-button" onClick={() => dispatch({ type: 'depart', adventureId: adventure.id, now: Date.now(), seed: randomSeed() })}>準備完了・出発</button></>}
          {(status === 'away' || status === 'ready') && <>
            <p className="adventure-status">{status === 'away' ? '冒険中・持ち物変更不可' : '帰還できる時間です'}</p>
            <p className="adventure-time">今回 {clockText(adventure.timing!.durationMs)}<span>残り <strong>{clockText(adventure.timing!.returnAt - now)}</strong></span></p>
            {status === 'ready' && <button className="primary-button" onClick={() => dispatch({ type: 'return', adventureId: adventure.id, now: Date.now(), seed: randomSeed() })}>帰還を迎える</button>}
          </>}
          {status === 'returned' && <><p>おかえり！整理が済んだら、好きな時に。</p>
            <button className="primary-button" onClick={() => dispatch({ type: 'next', adventureId: adventure.id })}>翌日へ →</button></>}
        </div>
        {state.pendingIncoming.length > 0 && <div className="pending-arrivals">
          <p>受取待ち <strong>{state.pendingIncoming.length}個</strong>（空くまで保管）</p>
          <button className="secondary-button" onClick={() => dispatch({ type: 'receive', seed: randomSeed() })}>受取待ちを入庫</button>
        </div>}
        {report && <details className="return-panel"><summary>最近の帰還記録</summary>
          <p className="return-comment">「{report.comment}」</p><p>返却 {report.equipmentCount}個・消耗 {report.consumedCount}個・戦利品 {report.lootCount}個</p>
          <p>帰還済み {state.adventures.filter((a) => hasReturned(state, a)).length}回{state.legacy ? '・旧記録も保持' : ''}</p>
        </details>}
        <details className="save-tools"><summary>{saveMessage}</summary>
          <p>このブラウザで続きから再開できます。時刻は端末の時計を使います。</p>
          <button className="secondary-button" onClick={reset}>記録を初期化</button>
        </details>
      </aside>
      <section className="warehouse" aria-labelledby="warehouse-title">
        <div className="warehouse-heading"><h2 id="warehouse-title">はじまりの倉庫</h2><span className="stock-count">在庫 <strong>{stock}</strong> / {state.slots.length} 枠</span></div>
        <div className="inventory-scroll" data-scroll-area role="region" aria-label="倉庫のアイテム一覧" tabIndex={0}>
          <div className="inventory-grid">{cells(state.slots, 'warehouse')}</div>
        </div>
        <div className="action-panel">
          <div className="selection-info">
            {selected ? <ItemIcon kind={selected.kind} className="selection-icon" /> : <span className="empty-selection" aria-hidden="true">◇</span>}
            <div><strong>{selected ? ITEM_TYPES[selected.kind].name : '品を選ぶと操作が表示されます'}</strong>
              <span>{state.moving ? '移動先をタップ・品があれば交換' : selected ? state.selection!.at.area === 'hero' && !editableHero ? '冒険中の持ち物は変更できません' : `${state.selection!.at.area === 'warehouse' ? '倉庫' : '勇者の持ち物'}・移動か支給を選べます` : 'PCはドラッグ・スマホは長押しで運べます'}</span></div>
            {selected && <button className="clear-button" aria-label="選択を解除" onClick={() => dispatch({ type: 'cancel' })}>×</button>}
          </div>
          <div className="action-buttons">
            <button className="secondary-button" disabled={!selected || (state.selection?.at.area === 'hero' && !editableHero)} onClick={() => dispatch({ type: 'move' })}>移動・交換</button>
            <button className="primary-button" disabled={!canQuickMove} onClick={() => {
              if (state.selection && selected && destination) dispatch({ type: 'transfer', from: state.selection.at, to: destination, itemId: selected.id, adventureId: adventure.id })
            }}>{state.selection?.at.area === 'hero' ? '倉庫へ戻す' : '勇者へ渡す'}</button>
          </div>
        </div>
        <p className="notice" role="status">{state.notice}</p>
      </section>
    </main>
    {drag.drag?.mode === 'touch' && <div className="drag-ghost" aria-hidden="true" style={{ left: drag.drag.x, top: drag.drag.y }}>
      <ItemIcon kind={drag.drag.item.kind} className="item-icon" /><span>{ITEM_TYPES[drag.drag.item.kind].name}</span>
    </div>}
  </div>
}
export default App
