/** Share in-flight work and retain a trailing request so newer events are read. */
export function createCoalescedRefresh(refresh: () => Promise<unknown>) {
  let running: Promise<void> | null = null
  let queued = false
  return function run(): Promise<void> {
    queued = true
    if (running) return running
    running = (async () => {
      do {
        queued = false
        await refresh()
      } while (queued)
    })().finally(() => { running = null })
    return running
  }
}
