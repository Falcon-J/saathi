const positionKey = "__saathiHistoryPosition"
const installedKey = Symbol.for("saathi.browser-history.positions")
type HistoryDispatcher = { subscribers: Set<(event: PopStateEvent) => void> }
export type HistoryPosition = { session: string | null; index: number | null; nativeIndex: number | null }

/** Only application metadata enters Next's public native-history integration. */
export function publicHistoryState(state: unknown): Record<string, unknown> {
  if (!state || typeof state !== "object" || Array.isArray(state)) return {}
  return Object.fromEntries(Object.entries(state).filter(([key]) => !["__NA", "_N", "__N", "__saathiCanvas"].includes(key) && !key.startsWith("__PRIVATE_NEXTJS_")))
}

export function readHistoryPosition(browser: Window): HistoryPosition {
  const marker = browser.history.state?.[positionKey]
  const native = (browser as Window & { navigation?: { currentEntry?: { index?: number } } }).navigation?.currentEntry?.index
  return { session: typeof marker?.session === "string" ? marker.session : null,
    index: Number.isSafeInteger(marker?.index) ? marker.index : null,
    nativeIndex: Number.isSafeInteger(native) && (native as number) >= 0 ? native as number : null }
}

/** Signed distance back to the accepted entry; null means direction is unknowable. */
export function historyTraversalDelta(accepted: HistoryPosition, destination: HistoryPosition): number | null {
  if (accepted.session && accepted.session === destination.session && accepted.index !== null && destination.index !== null) return accepted.index - destination.index
  if (accepted.nativeIndex !== null && destination.nativeIndex !== null) return accepted.nativeIndex - destination.nativeIndex
  return null
}

/** Window-lifetime instrumentation, independent of React mounts and storage availability.
 * Internal Next writes keep their markers. Public application writes must use publicHistoryState.
 */
export function installHistoryPositions(browser: Window): void {
  const windowState = browser as unknown as Record<symbol, unknown>
  if (windowState[installedKey]) return
  const dispatcher: HistoryDispatcher = { subscribers: new Set() }
  windowState[installedKey] = dispatcher
  const history = browser.history
  const push = history.pushState.bind(history), replace = history.replaceState.bind(history)
  const initial = readHistoryPosition(browser)
  let session = initial.session ?? `${Date.now()}-${Math.random()}`
  let index = initial.index ?? 0
  const mark = (state: unknown, next: number) => ({ ...publicHistoryState(history.state), ...(state && typeof state === "object" ? state : {}), [positionKey]: { session, index: next } })
  // Metadata-only annotation retains the current route tree, without navigating.
  replace(mark(history.state, index), "", browser.location.href)
  history.pushState = (state, title, url) => {
    const next = index + 1
    push(mark(state, next), title, url)
    index = next
  }
  history.replaceState = (state, title, url) => { replace(mark(state, index), title, url) }
  browser.addEventListener("popstate", event => {
    const current = readHistoryPosition(browser)
    if (current.session && current.index !== null) { session = current.session; index = current.index }
    else { session = `${Date.now()}-${Math.random()}`; index = 0 }
    // Root registration precedes Next. Dispatch guards here: a later native
    // listener can synchronously unmount a page and remove its own listener.
    for (const subscriber of [...dispatcher.subscribers]) {
      if (dispatcher.subscribers.has(subscriber)) subscriber(event)
      if (event.cancelBubble) break
    }
  }, { capture: true })
}

export function subscribeHistoryTraversal(browser: Window, subscriber: (event: PopStateEvent) => void): () => void {
  installHistoryPositions(browser)
  const dispatcher = (browser as unknown as Record<symbol, HistoryDispatcher>)[installedKey]
  dispatcher.subscribers.add(subscriber)
  return () => { dispatcher.subscribers.delete(subscriber) }
}
