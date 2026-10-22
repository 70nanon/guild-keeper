import { useEffect, useReducer, useRef, useState } from 'react'
import { ITEM_TYPES } from './game/data'
import type { Item } from './game/data'
import { canTransfer, currentAdventure, gameReducer, getSelectedItem, phase } from './game/game'
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
  const [menuOpen, setMenuOpen] = useState(false)
  const [planOpen, setPlanOpen] = useState(false)
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
      setSaveMessage('自動保存済み・このブラウザに記録')
    } catch {
      setSaveMessage('保存できません。再読み込みすると未保存の進行が失われます。容量・設定を確認してください。')
    }
  }, [state, blocked])
  const adventure = currentAdventure(state)
  const status = phase(state, now)
  const selected = getSelectedItem(state)
  const editableHero = status === 'preparing' || status === 'returned'
  const drag = useItemDrag({
    adventureId: adventure.id,
    canDrop: (s, to) => canTransfer(state, s.from, to, s.item.id, s.adventureId),
    drop: (s, to) => dispatch({ type: 'transfer', from: s.from, to, itemId: s.item.id, adventureId: s.adventureId }),
  })
  const reset = () => {
    if (!window.confirm('保存中の記録を初期化し、1日目から始めますか？')) return
    drag.cancel(); lastTap.current = null; dispatch({ type: 'reset' }); setBlocked(false); setMenuOpen(false)
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
      {item ? <><ItemIcon kind={item.kind} className="item-icon" /><span className="item-name">{ITEM_TYPES[item.kind].name}</span></>
        : <span className="empty-mark" aria-hidden="true">·</span>}
      {chosen && <span className="selected-mark" aria-hidden="true">✓</span>}
    </button>
  })
  const report = state.adventures.findLast((a) => a.returned)?.returned?.report ?? state.legacy?.lastReturn
  const heroCount = state.heroSlots.filter(Boolean).length
  const stock = state.slots.filter(Boolean).length
  const intakeCandidates = [...state.heroSlots.map((item, index) => ({ item, place: `勇者の枠${index + 1}` })),
    ...state.pendingIncoming.map((item, index) => ({ item, place: `一時選別${index + 1}` }))]
  return <div className={`app-shell ${drag.drag ? 'is-dragging' : ''}`}
    onDragOver={drag.overMouse} onDrop={drag.dropMouse}
    onClickCapture={(e) => {
      if (!(e.target as Element).closest('.item-slot')) lastTap.current = null
      if (e.detail && (e.target as Element).closest('.item-slot') && drag.suppressClick()) { e.preventDefault(); e.stopPropagation() }
    }}>
    <div className="game-surface" inert={menuOpen || planOpen}>
    <header className="site-header"><button className="menu-toggle secondary-button" aria-label="メニューを開く" onClick={() => { drag.cancel(); setMenuOpen(true) }}>☰</button>
      <div className="brand"><span className="brand-mark" aria-hidden="true">▤</span><h1>Guild Keeper</h1></div>
      <span className="version">勇者にはならない。勇者を倉庫から支える。<span>基本ループ試遊版</span></span>
      {saveMessage.startsWith('保存できません') && <p className="save-warning" role="alert">保存失敗 · メニューで確認</p>}
    </header>
    <main className="workspace">
      <section className="adventure-strip" aria-label="冒険予定">
        <div className="plan-summary"><button className="plan-toggle" aria-expanded={planOpen} onClick={() => { drag.cancel(); setPlanOpen(true) }}>
          <span>{state.day}日目 · {adventure.title}</span><small>{status === 'preparing' ? '支度中' : status === 'returned' ? '帰還済み' : status === 'ready' ? '帰還可能' : '冒険中'} · {adventure.message.split('。')[0]} · 詳細を見る</small>
        </button>
        <div className="adventure-controls" data-phase={status}>
          {status === 'preparing' && <button className="primary-button" onClick={() => dispatch({ type: 'depart', adventureId: adventure.id, now: Date.now(), seed: randomSeed() })}>準備完了・出発</button>}
          {(status === 'away' || status === 'ready') && <><p className="adventure-time">今回 {clockText(adventure.timing!.durationMs)} · 残り <strong>{clockText(adventure.timing!.returnAt - now)}</strong></p>
            {status === 'ready' && <button className="primary-button" onClick={() => dispatch({ type: 'return', adventureId: adventure.id, now: Date.now(), seed: randomSeed() })}>帰還を迎える</button>}</>}
          {status === 'returned' && <button className="primary-button" onClick={() => dispatch({ type: 'next', adventureId: adventure.id })}>翌日へ →</button>}
        </div></div>
      </section>
      <section className="hero-panel" data-scroll-area aria-labelledby="hero-title">
        <div className="hero-heading"><h2 id="hero-title">勇者の持ち物</h2><span>{heroCount} / 8 枠{!editableHero ? ' · 冒険中は変更不可' : ' · ダブルタップで返却'}</span></div>
        <div className={`hero-grid ${!editableHero ? 'hero-locked' : ''}`} aria-label="勇者のインベントリ">{cells(state.heroSlots, 'hero')}</div>
        {state.pendingIncoming.length > 0 && <details className="sorting-panel"><summary>一時選別 {state.pendingIncoming.length}個 · 消えずに持ち越します</summary>
          <div className="sorting-scroll" data-scroll-area><div className="inventory-grid">{cells(state.pendingIncoming, 'sorting')}</div></div>
          <p>8枠を超えた品・旧受取待ちです。倉庫か勇者の空き枠へ移せます。冒険には8枠の品だけを持参します。</p>
        </details>}
        {status === 'returned' && <div className="intake-panel">
          <details><summary>入庫する帰還品を選ぶ（{state.intakeSelection.length}個選択）</summary>
            <div className="intake-options">{intakeCandidates.flatMap(({ item: i, place }) => i ? [<label key={i.id}>
              <input type="checkbox" checked={state.intakeSelection.includes(i.id)} onChange={() => dispatch({ type: 'intake-toggle', itemId: i.id })} />{ITEM_TYPES[i.kind].name}<small> · {place}</small>
            </label>] : [])}</div>
          </details>
          <button className="secondary-button" disabled={!state.intakeSelection.length} onClick={() => dispatch({ type: 'receive', seed: randomSeed() })}>選択品を入庫</button>
          {report && <p className="return-comment">「{report.comment}」</p>}
        </div>}
      </section>
      <section className="warehouse" aria-labelledby="warehouse-title">
        <div className="warehouse-heading"><h2 id="warehouse-title">はじまりの倉庫</h2><span className="stock-count">在庫 <strong>{stock}</strong> / {state.slots.length} 枠</span></div>
        <div className="inventory-scroll" data-scroll-area role="region" aria-label="倉庫のアイテム一覧" tabIndex={0}>
          <div className="inventory-grid">{cells(state.slots, 'warehouse')}</div>
        </div>
        <div className="action-panel">
          <div className="selection-info">
            {selected ? <ItemIcon kind={selected.kind} className="selection-icon" /> : <span className="empty-selection" aria-hidden="true">◇</span>}
            <div><strong>{selected ? ITEM_TYPES[selected.kind].name : '品を選ぶと操作が表示されます'}</strong>
              <span>{state.moving ? '移動先をタップ・品があれば交換' : selected ? state.selection!.at.area === 'hero' && !editableHero ? '冒険中の持ち物は変更できません' : `${state.selection!.at.area === 'warehouse' ? '倉庫' : '勇者の持ち物'}・移動か支給を選べます` : '長押しで運ぶ・ダブルタップで支給／返却'}</span></div>
            {selected && <button className="clear-button" aria-label="選択を解除" onClick={() => dispatch({ type: 'cancel' })}>×</button>}
          </div>
          <div className="action-buttons">
            <button className="secondary-button" disabled={!selected || (state.selection?.at.area === 'hero' && !editableHero)} onClick={() => dispatch({ type: 'move' })}>移動・交換</button>
            <button className="primary-button" disabled={!selected} onClick={() => {
              if (state.selection && selected) dispatch({ type: 'quick', from: state.selection.at, itemId: selected.id, adventureId: adventure.id })
            }}>{state.selection?.at.area !== 'warehouse' && selected ? '倉庫へ戻す' : '勇者へ渡す'}</button>
          </div>
        </div>
        <p className="notice" role="status">{state.notice}</p>
      </section>
    </main>
    </div>
    {menuOpen && <div className="overlay" onKeyDown={(e) => { if (e.key === 'Escape') setMenuOpen(false) }}>
      <button className="overlay-backdrop" aria-label="メニューを閉じる" onClick={() => setMenuOpen(false)} />
      <dialog open aria-modal="true" className="side-menu" aria-labelledby="menu-title"><h2 id="menu-title">倉庫の帳簿</h2>
        <button autoFocus className="secondary-button" onClick={() => setMenuOpen(false)}>閉じる</button>
        <p className="save-message">{saveMessage}</p><p>このブラウザに自動保存。時刻は端末の時計を使います。</p>
        {report && <p>最近の帰還：{report.comment}</p>}
        <button className="secondary-button" onClick={reset}>記録を初期化</button>
      </dialog>
    </div>}
    {planOpen && <div className="overlay" onKeyDown={(e) => { if (e.key === 'Escape') setPlanOpen(false) }}>
      <button className="overlay-backdrop" aria-label="冒険の詳細を閉じる" onClick={() => setPlanOpen(false)} />
      <dialog open aria-modal="true" className="plan-dialog" aria-labelledby="adventure-title"><h2 id="adventure-title">{adventure.title}</h2>
        <button autoFocus className="secondary-button" onClick={() => setPlanOpen(false)}>詳細を閉じる</button>
        <p>{adventure.message}</p><p>好きな道具を8枠に準備できます。準備完了で出発し、帰還後は選んだ品だけ入庫。残りは翌日も勇者が持ち越します。</p>
        {report && <p>最近の帰還：「{report.comment}」</p>}
      </dialog>
    </div>}
    {drag.drag?.mode === 'touch' && <div className="drag-ghost" aria-hidden="true" style={{ left: drag.drag.x, top: drag.drag.y }}>
      <ItemIcon kind={drag.drag.item.kind} className="item-icon" /><span>{ITEM_TYPES[drag.drag.item.kind].name}</span>
    </div>}
  </div>
}
export default App
