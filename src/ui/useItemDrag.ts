import { useEffect, useRef, useState } from 'react'
import type { DragEvent, TouchEvent as ReactTouchEvent } from 'react'
import type { Item } from '../game/data'
import type { Location } from '../game/game'

export type DragSession = { from: Location; item: Item; adventureId: string; mode: 'mouse' | 'touch'; x: number; y: number; over: Location | null }
type Config = { adventureId: string; canDrop: (s: DragSession, to: Location) => boolean; drop: (s: DragSession, to: Location) => void }
function locationAt(x: number, y: number): Location | null {
  const element = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-area][data-slot]')
  const area = element?.dataset.area
  return area === 'warehouse' || area === 'hero' || area === 'sorting' ? { area, slot: Number(element!.dataset.slot) } : null
}
const same = (a: Location | null, b: Location | null) => a?.area === b?.area && a?.slot === b?.slot

// Native HTML drag for mouse; cancellable long-press Touch Events for mobile.
// Touchstart is never prevented. Scrolling before the hold cancels the gesture.
export function useItemDrag(config: Config) {
  const [drag, setDrag] = useState<DragSession | null>(null)
  const configRef = useRef(config)
  const session = useRef<DragSession | null>(null)
  const pending = useRef<{ timer: ReturnType<typeof setTimeout>; id: number; x: number; y: number } | null>(null)
  const suppressUntil = useRef(0)
  useEffect(() => { configRef.current = config }, [config])
  const cancel = () => {
    if (pending.current) clearTimeout(pending.current.timer)
    pending.current = null
    if (session.current?.mode === 'touch') suppressUntil.current = performance.now() + 400
    session.current = null
    setDrag(null)
  }
  const refresh = (x: number, y: number) => {
    const s = session.current
    if (!s) return
    const target = locationAt(x, y)
    const over = target && configRef.current.canDrop(s, target) ? target : null
    session.current = { ...s, x, y, over }
    setDrag((previous) => previous && (previous.x !== x || previous.y !== y || !same(previous.over, over)) ? session.current : previous)
  }
  // Document listeners keep a held item alive when the finger leaves its cell.
  useEffect(() => {
    const move = (event: TouchEvent) => {
      const tracked = pending.current
      const s = session.current
      if (event.touches.length !== 1) { cancel(); return }
      const point = event.touches[0]
      if (tracked && Math.hypot(point.clientX - tracked.x, point.clientY - tracked.y) > 8) {
        clearTimeout(tracked.timer); pending.current = null
      }
      if (s?.mode === 'touch') {
        if (event.cancelable) event.preventDefault()
        refresh(point.clientX, point.clientY)
      }
    }
    const end = (event: TouchEvent) => {
      const s = session.current
      if (s?.mode === 'touch') {
        if (event.cancelable) event.preventDefault()
        const point = event.changedTouches[0]
        const to = point ? locationAt(point.clientX, point.clientY) : null
        if (to) configRef.current.drop(s, to)
      }
      cancel()
    }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel() }
    const interrupt = () => cancel()
    const multiple = (event: TouchEvent) => { if (event.touches.length > 1) cancel() }
    document.addEventListener('touchmove', move, { passive: false })
    document.addEventListener('touchend', end, { passive: false })
    document.addEventListener('touchcancel', interrupt)
    document.addEventListener('touchstart', multiple, { passive: true })
    document.addEventListener('keydown', key)
    window.addEventListener('blur', interrupt)
    document.addEventListener('visibilitychange', interrupt)
    return () => {
      if (pending.current) clearTimeout(pending.current.timer)
      document.removeEventListener('touchmove', move)
      document.removeEventListener('touchend', end)
      document.removeEventListener('touchcancel', interrupt)
      document.removeEventListener('touchstart', multiple)
      document.removeEventListener('keydown', key)
      window.removeEventListener('blur', interrupt)
      document.removeEventListener('visibilitychange', interrupt)
    }
  }, [])
  // Scroll the container under the pointer at its top/bottom edge, including
  // while a held touch is stationary. Drop hit-testing follows the scrolled cells.
  const dragging = drag !== null
  useEffect(() => {
    if (!dragging) return
    let frame = 0
    let edge: { box: HTMLElement; delta: number; x: number; y: number; since: number } | null = null
    const scroll = () => {
      const s = session.current
      if (!s) return
      const box = document.elementFromPoint(s.x, s.y)?.closest<HTMLElement>('[data-scroll-area]')
      if (box) {
        const rect = box.getBoundingClientRect()
        const delta = s.y < rect.top + 30 ? -8 : s.y > rect.bottom - 30 ? 8 : 0
        if (delta && box.scrollHeight > box.clientHeight) {
          if (!edge || edge.box !== box || edge.delta !== delta || Math.hypot(edge.x - s.x, edge.y - s.y) > 8) {
            edge = { box, delta, x: s.x, y: s.y, since: performance.now() }
          }
          // Do not shift a target while the player merely crosses an edge.
          if (performance.now() - edge.since >= 300) {
            box.scrollTop += delta
            refresh(s.x, s.y)
          }
        } else edge = null
      } else edge = null
      frame = requestAnimationFrame(scroll)
    }
    frame = requestAnimationFrame(scroll)
    return () => cancelAnimationFrame(frame)
  }, [dragging])
  return {
    drag,
    cancel,
    suppressClick: () => performance.now() < suppressUntil.current,
    startMouse: (event: DragEvent, from: Location, item: Item) => {
      if (pending.current || session.current?.mode === 'touch') { event.preventDefault(); return }
      const s: DragSession = { from, item, adventureId: config.adventureId, mode: 'mouse', x: event.clientX, y: event.clientY, over: null }
      event.dataTransfer.setData('text/plain', item.id)
      event.dataTransfer.effectAllowed = 'move'
      session.current = s; setDrag(s)
    },
    overMouse: (event: DragEvent) => {
      if (!session.current || session.current.mode !== 'mouse') return
      refresh(event.clientX, event.clientY)
      const to = locationAt(event.clientX, event.clientY)
      if (to) { event.preventDefault(); event.dataTransfer.dropEffect = 'move' }
    },
    dropMouse: (event: DragEvent) => {
      if (!session.current || session.current.mode !== 'mouse') return
      event.preventDefault()
      const to = locationAt(event.clientX, event.clientY)
      if (to) config.drop(session.current, to)
      cancel()
    },
    startTouch: (event: ReactTouchEvent, from: Location, item: Item) => {
      if (event.touches.length !== 1 || session.current || pending.current) return
      const point = event.touches[0]
      const { clientX: x, clientY: y, identifier: id } = point
      const adventureId = config.adventureId
      const timer = setTimeout(() => {
        if (!pending.current) return
        pending.current = null
        const s: DragSession = { from, item, adventureId, mode: 'touch', x, y, over: null }
        session.current = s; setDrag(s)
      }, 450)
      pending.current = { timer, id, x, y }
    },
  }
}
