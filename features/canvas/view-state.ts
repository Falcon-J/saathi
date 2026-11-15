import { cameraStorageKey, createCanvasNavigation, type CanvasFocus, type CanvasScope } from "./model.ts"

type PreferenceStorage = Pick<Storage, "getItem" | "setItem">
const identifier = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 200
function validFocus(value: unknown): value is CanvasFocus {
  if (!value || typeof value !== "object") return false
  const focus = value as Record<string, unknown>
  return focus.kind === "overview" || (identifier(focus.workspaceId)
    && (focus.kind === "workspace" || (focus.kind === "task" && identifier(focus.taskId))))
}

/** Opaque presentation IDs only. Current authorized graphs must reconcile this preference. */
export function readCanvasView(scope: CanvasScope, storage?: PreferenceStorage) {
  const empty = createCanvasNavigation(scope)
  try {
    const preferences = storage ?? window.localStorage
    const saved = JSON.parse(preferences.getItem(`${cameraStorageKey(scope)}:view`) ?? "null")
    if (saved?.version === 1 && saved.scope?.actorId === scope.actorId && saved.scope?.canvasId === scope.canvasId && validFocus(saved.focus)) {
      return { ...empty, focus: saved.focus }
    }
  } catch { /* Preferences are optional, including when storage is unavailable. */ }
  return empty
}

export function saveCanvasView(scope: CanvasScope, focus: CanvasFocus, storage?: PreferenceStorage) {
  const key = `${cameraStorageKey(scope)}:view`
  try {
    const preferences = storage ?? window.localStorage
    const value = JSON.stringify({ version: 1, scope, focus })
    if (preferences.getItem(key) !== value) preferences.setItem(key, value)
  } catch { /* A preference failure must never block work. */ }
}
