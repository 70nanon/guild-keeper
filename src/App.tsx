import { useReducer } from 'react'
import { ITEM_TYPES, ORDERS } from './game/data'
import { createGame, gameReducer, getSelectedItem, isFinished, isOrderComplete } from './game/game'
import { ItemIcon } from './ui/ItemIcon'
import './App.css'

function App() {
  const [state, dispatch] = useReducer(gameReducer, undefined, createGame)
  const order = ORDERS[state.orderIndex]
  const selected = getSelectedItem(state)
  const complete = isOrderComplete(state)
  const finished = isFinished(state)
  const remaining = state.slots.filter(Boolean).length
  const fulfilled = order.lines.reduce((sum, line) => sum + (state.delivered[line.kind] ?? 0), 0)
  const requested = order.lines.reduce((sum, line) => sum + line.quantity, 0)

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="brand"><span className="brand-mark" aria-hidden="true">▤</span><h1>Guild Keeper</h1></div>
        <span className="version">勇者にはならない。勇者を倉庫から支える。<span>v0.1</span></span>
      </header>

      <main className="workspace">
        <aside className={`order-panel ${complete ? 'order-complete' : ''}`} aria-labelledby="order-title">
          <div className="order-heading"><span className="eyebrow">勇者 アレンの注文書</span><span className="order-number">{state.orderIndex + 1} / {ORDERS.length}</span></div>
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
              <p>{finished ? 'すべての注文を届けました！' : 'ありがとう、これで準備は万全だね。'}</p>
              {finished ? (
                <button className="primary-button" onClick={() => dispatch({ type: 'reset' })}>最初から遊ぶ</button>
              ) : (
                <button className="primary-button" onClick={() => dispatch({ type: 'next', orderId: order.id })}>次の注文へ <span aria-hidden="true">→</span></button>
              )}
            </div>
          )}
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
