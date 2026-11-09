/** Share in-flight work and retain a trailing request so newer events are read. */
export function createCoalescedRefresh<T>(refresh: () => Promise<T>) {
  let running: Promise<T> | null = null
  let queued = false
  return function run(): Promise<T> {
    queued = true
    if (running) return running
    running = (async () => {
      let result: T
      do {
        queued = false
        result = await refresh()
      } while (queued)
      return result
    })().finally(() => { running = null })
    return running
  }
}
