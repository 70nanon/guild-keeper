import { ITEM_TYPES } from '../game/data'
import { currentAdventure, hasReturned } from '../game/game'
import type { GameAction, GameState } from '../game/game'
import { ItemIcon } from './ItemIcon'

// History remains a receipt. Only hero/overflow items are available for intake.
export function ReturnResults({ state, dispatch, seed }: { state: GameState; dispatch: (a: GameAction) => void; seed: () => number }) {
  const adventure = currentAdventure(state)
  const batch = adventure.returned
  const report = batch?.report ?? state.legacy?.lastReturn
  const owned = [...state.heroSlots, ...state.pendingIncoming].filter((i) => i !== null)
  const returnedIds = new Set(batch?.items.map((i) => i.id))
  const rows = [...(batch?.items ?? []), ...owned.filter((i) => !returnedIds.has(i.id))]
  const available = new Set(owned.map((i) => i.id))
  const equipmentIds = new Set(adventure.issued.filter((i) => ITEM_TYPES[i.kind].category !== '消耗品').map((i) => i.id))
  const consumed = adventure.issued.filter((i) => ITEM_TYPES[i.kind].category === '消耗品')
  const free = state.slots.filter((i) => i === null).length
  return <div className="return-results">
    {report && <><p className="return-comment">「{report.comment}」</p>
      <p className="receipt-counts">返却 {report.equipmentCount} · 戦利品 {report.lootCount} · 使用 {report.consumedCount}</p></>}
    <div className="intake-summary"><strong>空き {free} / 選択 {state.intakeSelection.length}</strong>
      <button className="primary-button" disabled={!hasReturned(state) || !state.intakeSelection.length} onClick={() => dispatch({ type: 'receive', seed: seed() })}>選択品を入庫</button>
    </div>
    {free === 0 && <p>倉庫が満杯です。画面を閉じて整理し、空きができたら再び選別できます。</p>}
    {state.feedback === 'error' && <p role="alert" className="operation-error">{state.notice}</p>}
    <div className="result-items">{rows.map((i, index) => <label key={i.id} className={`result-item ${available.has(i.id) ? '' : 'received-item'}`}>
      <input type="checkbox" aria-label={`${ITEM_TYPES[i.kind].name} ${index + 1}`} disabled={!available.has(i.id)}
        checked={state.intakeSelection.includes(i.id)} onChange={() => dispatch({ type: 'intake-toggle', itemId: i.id })} />
      <ItemIcon kind={i.kind} className="item-icon" />
      <span>{ITEM_TYPES[i.kind].name}<small>{!available.has(i.id) ? '入庫済み' : !returnedIds.has(i.id) ? '持ち越し' : equipmentIds.has(i.id) ? '返却装備' : '戦利品'}</small></span>
    </label>)}</div>
    {consumed.length > 0 && <details className="consumed-items"><summary>使用した消耗品（{consumed.length}）</summary>
      <ul>{consumed.map((i) => <li key={i.id}>{ITEM_TYPES[i.kind].name}</li>)}</ul>
    </details>}
    <p className="result-note">選ばなかった品は勇者が持ち越します。</p>
  </div>
}
