import { useEffect, useReducer, useState } from 'react'
import { ITEM_TYPES } from './game/data'
import { gameReducer, getSelectedItem, getReturnableOrder, canAdvanceDay, isOrderComplete } from './game/game'
import { loadGame, saveGame } from './game/save'
import { ItemIcon } from './ui/ItemIcon'
import './App.css'

function randomSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0]
}

const browserStorage = {
  getItem: (key: string) => window.localStorage.getItem(key),
  setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
}

function App() {
  const [loaded] = useState(() => loadGame(browserStorage))
  const [state, dispatch] = useReducer(gameReducer, loaded.state)
  const [blocked, setBlocked] = useState(loaded.blocked)
  const [saveMessage, setSaveMessage] = useState(loaded.message)
  useEffect(() => {
    if (blocked) return
    try {
      saveGame(browserStorage, state)
      // oxlint-disable-next-line react/set-state-in-effect -- 外部ストレージへの同期結果を表示する。
      setSaveMessage('自動保存済み・このブラウザに記録')
    } catch {
      setSaveMessage('保存できません。容量・ブラウザ設定を確認してください。再読み込みすると未保存の進行が失われます。')
    }
  }, [state, blocked])
  const reset = () => {
    if (!window.confirm('保存中の記録を初期化し、1日目から始めますか？')) return
    dispatch({ type: 'reset' })
    setBlocked(false)
  }
  if (blocked) return <div className="recovery-panel">
    <h1>Guild Keeper</h1><p role="alert">{saveMessage}</p>
    <p>既存の記録は上書きしていません。</p>
    <button className="secondary-button" onClick={() => window.location.reload()}>再読み込み</button>
    <button className="primary-button" onClick={reset}>記録を初期化して始める</button>
  </div>
  const order = state.orders[state.orderIndex]
  const selected = getSelectedItem(state)
  const complete = isOrderComplete(state)
  const nextDay = canAdvanceDay(state)
  const returnable = getReturnableOrder(state)
  const remaining = state.slots.filter(Boolean).length
  const fulfilled = order.lines.reduce((sum, line) => sum + (state.delivered[line.kind] ?? 0), 0)
  const requested = order.lines.reduce((sum, line) => sum + line.quantity, 0)

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="brand"><span className="brand-mark" aria-hidden="true">▤</span><h1>Guild Keeper</h1></div>
        <span className="version">勇者にはならない。勇者を倉庫から支える。<span>継続プレイ MVP</span></span>
      </header>

      <main className="workspace">
        <aside className={`order-panel ${complete ? 'order-complete' : ''}`} aria-labelledby="order-title">
          <div className="order-heading"><span className="eyebrow">勇者 アレンの注文書</span><span className="order-number">{state.orderIndex + 1}日目</span></div>
          <h2 id="order-title">{order.title}</h2>
          <p className="order-message">{order.message}</p>
          <ul className="order-lines" aria-label="必要なアイテム">
            {order.lines.map((line) => {
              const type = ITEM_TYPES[line.kind]
              const count = state.delivered[line.kind] ?? 0
              return (
                <li key={line.kind} className={count === line.quantity ? 'line-complete' : ''}>
                  <ItemIcon kind={line.kind} className="order-item-icon" />
                  <span>{type.name}</span>
                  <span className="quantity" aria-label={`${type.name} ${line.quantity}個中${count}個納品済み`}>{count} / {line.quantity}<span aria-hidden="true">{count === line.quantity ? ' ✓' : ''}</span></span>
                </li>
              )
            })}
          </ul>
          <div className="order-progress"><span>{complete ? '✓ 注文完了' : '納品状況'}</span><span>{fulfilled} / {requested} 個</span></div>
          {complete && (
            <div className="completion">
              <p>{nextDay ? 'おかえり！整理は自由。準備ができたら翌日へ。' : '準備は万全。帰還ボタンで勇者を迎えよう。'}</p>
              {nextDay && <button className="primary-button" onClick={() => dispatch({ type: 'next', orderId: order.id, seed: randomSeed() })}>翌日へ <span aria-hidden="true">→</span></button>}
            </div>
          )}
          {(returnable || state.lastReturn) && (
            <section className="return-panel" aria-label="勇者の帰還と入荷">
              {returnable && <>
                <p className="return-caption">「{returnable.title}」の帰還待ち</p>
                <button className="secondary-button" onClick={() => dispatch({ type: 'return', orderId: returnable.id, seed: randomSeed() })}>勇者の帰還</button>
              </>}
              {state.lastReturn && <div className="return-report">
                <p className="return-comment">「{state.lastReturn.comment}」</p>
                <p>返却 {state.lastReturn.equipmentCount}個・消耗 {state.lastReturn.consumedCount}個・戦利品 {state.lastReturn.lootCount}個</p>
              </div>}
              {state.pendingIncoming.length > 0 && <div className="pending-arrivals">
                <p>受取待ち <strong>{state.pendingIncoming.length}個</strong>（空きができるまで保管）</p>
                <button className="secondary-button" onClick={() => dispatch({ type: 'receive', seed: randomSeed() })}>受取待ちを入庫</button>
              </div>}
            </section>
          )}
          <div className="save-tools">
            <p className="save-message" aria-live="polite">{saveMessage}</p>
            <button className="secondary-button" onClick={reset}>記録を初期化</button>
          </div>
          <p className="order-hint">品を選ぶ → 納品する<br />並べ替えは「入れ替える」→ 移動先をタップ</p>
        </aside>

        <section className="warehouse" aria-labelledby="warehouse-title">
          <div className="warehouse-heading">
            <div><p className="eyebrow">WAREHOUSE</p><h2 id="warehouse-title">はじまりの倉庫</h2></div>
            <p className="stock-count">在庫 <strong>{remaining}</strong><span> / {state.slots.length} 枠</span></p>
          </div>
          <div className={`inventory-scroll ${state.moving ? 'is-moving' : ''}`} tabIndex={0} role="region" aria-label="倉庫のアイテム一覧">
            <div className="inventory-grid">
              {state.slots.map((item, index) => {
                const type = item ? ITEM_TYPES[item.kind] : null
                const active = item !== null && item.id === state.selectedId
                return (
                  <button
                    key={index}
                    className={`item-slot ${active ? 'is-selected' : ''} ${item ? '' : 'is-empty'}`}
                    aria-label={`スロット ${index + 1}：${type ? `${type.name}（${type.category}）` : '空き枠'}`}
                    aria-pressed={active}
                    data-item-id={item?.id}
                    data-kind={item?.kind}
                    data-slot={index}
                    onClick={() => dispatch({ type: 'select', slot: index })}
                  >
                    {type && item ? <><ItemIcon kind={item.kind} className="item-icon" /><span className="item-name">{type.name}</span></> : <span className="empty-mark" aria-hidden="true">·</span>}
                    {active && <span className="selected-mark" aria-hidden="true">✓</span>}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="action-panel">
            <div className="selection-info">
              {selected ? <ItemIcon kind={selected.kind} className="selection-icon" /> : <span className="selection-icon empty-selection" aria-hidden="true">◇</span>}
              <div><strong>{selected ? ITEM_TYPES[selected.kind].name : 'アイテムを選択'}</strong><span>{state.moving ? '移動先を選んでください' : selected ? ITEM_TYPES[selected.kind].category : 'タップ・クリックで選べます'}</span></div>
              {selected && <button className="clear-button" aria-label="選択を解除" onClick={() => dispatch({ type: 'cancel' })}>✕</button>}
            </div>
            <div className="action-buttons">
              <button className="secondary-button" disabled={!selected || state.moving} onClick={() => dispatch({ type: 'move' })}>入れ替える</button>
              <button className="primary-button" disabled={!selected || state.moving || complete} onClick={() => {
                if (selected) dispatch({ type: 'deliver', itemId: selected.id, orderId: order.id })
              }}>納品する <span aria-hidden="true">↗</span></button>
            </div>
          </div>
          <p className="notice" role="status">{state.notice}</p>
        </section>
      </main>
    </div>
  )
}

export default App
