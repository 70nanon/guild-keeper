import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

// Native modal semantics provide focus containment; all closes are UI-only.
export function Modal({ title, close, children, side = false }: {
  title: string; close: () => void; children: ReactNode; side?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    const previous = document.activeElement as HTMLElement | null
    dialog.showModal()
    return () => { dialog.close(); if (previous?.isConnected) previous.focus({ preventScroll: true }) }
  }, [])
  return <dialog ref={ref} className={`game-dialog ${side ? 'side-menu' : ''}`} aria-label={title}
    onCancel={(e) => { e.preventDefault(); close() }}
    onClick={(e) => {
      if (e.target !== e.currentTarget) return
      const box = e.currentTarget.getBoundingClientRect()
      if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) close()
    }}>
    <div className="dialog-heading"><h2>{title}</h2><button className="icon-button" aria-label={`${title}を閉じる`} onClick={close}>×</button></div>
    {children}
  </dialog>
}
