export const MIN_CANVAS_ZOOM = 0.002
export const MAX_CANVAS_ZOOM = 2
export type SavedCanvasCamera = { x: number; y: number; zoom: number; canvasWidth?: number; canvasHeight?: number }

export function readCanvasCamera(key: string, focusKey: string, storage?: Pick<Storage, "getItem">): SavedCanvasCamera | null {
  try {
    const saved = JSON.parse((storage ?? window.localStorage).getItem(key) ?? "null")
    if (saved?.focusKey === focusKey && [saved.x, saved.y, saved.zoom].every(Number.isFinite)
      && saved.zoom >= MIN_CANVAS_ZOOM && saved.zoom <= MAX_CANVAS_ZOOM) return {
        x: saved.x, y: saved.y, zoom: saved.zoom,
        ...(Number.isFinite(saved.canvasWidth) && saved.canvasWidth > 0 && Number.isFinite(saved.canvasHeight) && saved.canvasHeight > 0
          ? { canvasWidth: saved.canvasWidth, canvasHeight: saved.canvasHeight } : {}),
      }
  } catch { /* Invalid or unavailable preferences fall back to authorized bounds. */ }
  return null
}

export function restoreCanvasCamera(saved: SavedCanvasCamera, width: number, height: number) {
  return { x: saved.x + (saved.canvasWidth && width > 0 ? (width - saved.canvasWidth) / 2 : 0),
    y: saved.y + (saved.canvasHeight && height > 0 ? (height - saved.canvasHeight) / 2 : 0), zoom: saved.zoom }
}

export function formatCanvasZoom(zoom: number): string {
  if (!Number.isFinite(zoom) || zoom <= 0) return '—'
  return `${Number((zoom * 100).toFixed(zoom < .1 ? 1 : 0))}%`
}
