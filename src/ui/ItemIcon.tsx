import type { ItemKind } from '../game/data'

type Tone = 'ink' | 'body' | 'light' | 'accent'
type PixelPart = readonly [path: string, tone: Tone]

// Original 16×16 stepped silhouettes. The four material paints are presentation
// tokens, not attributes/rarity. All three UI locations share these same shapes.
const GLYPHS: Record<ItemKind, readonly PixelPart[]> = {
  sword: [
    ['M11 1h4v4l-6 6 2 2-2 2-3-3-3 3H1v-2l3-3-2-2 2-2 2 2z', 'ink'],
    ['M12 2h2v2l-6 6-2-2z', 'body'],
    ['M12 2h2L7 9 6 8z', 'light'],
    ['M4 7l5 5v1L3 7zM2 13l3-3 1 1-3 3H2z', 'accent'],
  ],
  shield: [
    ['M2 1h12v8l-2 3-4 3-4-3-2-3z', 'ink'],
    ['M3 2h10v7l-2 2-3 2-3-2-2-2z', 'body'],
    ['M4 3h1v6H4zM7 3h1v9H7zM10 3h1v7h-1z', 'accent'],
    ['M7 5h2v4H7zM3 2h10v1H3z', 'light'],
  ],
  potion: [
    ['M5 0h6v3h-1v2l3 3v6l-2 2H5l-2-2V8l3-3V3H5z', 'ink'],
    ['M7 3h2v3l3 3v4l-2 2H6l-2-2V9l3-3z', 'body'],
    ['M4 10h8v3l-2 2H6l-2-2zM6 1h4v2H6z', 'accent'],
    ['M5 8h1v4H5zM7 4h1v2H7z', 'light'],
  ],
  staff: [
    ['M8 0h5l2 2v4l-3 3H9v6H6V7h3l3-3V3h-2v2H7V1z', 'ink'],
    ['M9 1h3l2 2v2l-3 3H8v6H7V7h3l3-3V3l-1-1h-2v2H8V2z', 'body'],
    ['M9 1h3v1H9zM7 8h1v5H7z', 'light'],
    ['M7 10h1v1H7zM11 2h1v1h-1z', 'accent'],
  ],
  herb: [
    ['M7 15V9H4L1 6V2h4l3 3 2-4h5v5l-4 4H9v5z', 'ink'],
    ['M2 3h2l3 3v2H5L2 5zM10 4l1-2h3v3l-3 3H9zM8 9h1v6H7v-1h1z', 'body'],
    ['M3 3h1l2 2H4zM11 2h2l-2 2h-1z', 'light'],
    ['M4 6h1l2 2H6zM10 6h2l-2 2H9z', 'accent'],
  ],
  helm: [
    ['M5 1h6l3 3v10H9v-3H7v3H2V4z', 'ink'],
    ['M5 2h5l3 3v8h-3v-3H6v3H3V5z', 'body'],
    ['M3 6h10v3H3z', 'ink'],
    ['M7 5h2v6H7zM5 3h5v1H5z', 'light'],
    ['M3 11h2v1H3zM11 11h2v1h-2z', 'accent'],
  ],
  ether: [
    ['M6 0h4v3l1 2v8l-3 3-3-3V5l1-2z', 'ink'],
    ['M7 3h2v2h1v7l-2 2-2-2V5h1z', 'body'],
    ['M6 8h4v4l-2 2-2-2zM7 1h2v1H7z', 'accent'],
    ['M7 5h1v6H7z', 'light'],
  ],
  boots: [
    ['M2 0h9v8l3 2 1 2v3H2z', 'ink'],
    ['M3 1h7v8l3 2v2H3z', 'body'],
    ['M3 1h7v2H3zM3 13h11v1H3z', 'light'],
    ['M6 5h3v1H6zM6 7h3v1H6zM6 9h3v1H6z', 'accent'],
  ],
}

export function ItemIcon({ kind, className = '' }: { kind: ItemKind; className?: string }) {
  return (
    <svg className={`item-glyph glyph-${kind} ${className}`} viewBox="0 0 16 16"
      aria-hidden="true" focusable="false" shapeRendering="crispEdges" data-glyph={kind}>
      {GLYPHS[kind].map(([path, tone], index) => (
        <path key={index} d={path} fill={`var(--glyph-${tone})`} />
      ))}
    </svg>
  )
}
