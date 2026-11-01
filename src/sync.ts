export async function withRetry<T>(operation: () => Promise<T>, attempts = 3, wait = defaultWait): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (attempt < attempts - 1) await wait(500 * (2 ** attempt))
    }
  }
  throw lastError
}

export function createLatestSaveQueue() {
  let tail = Promise.resolve()
  let latestVersion = 0

  return {
    reserve() {
      const version = ++latestVersion
      return {
        async run(operation: () => Promise<void>) {
          const queued = tail.then(operation)
          tail = queued.catch(() => undefined)
          try {
            await queued
            return { latest: version === latestVersion }
          } catch (error) {
            return { latest: version === latestVersion, error }
          }
        },
      }
    },
  }
}

/**
 * An already-open kitchen is the newest local source while offline. Reloading
 * its cache on the offline event can replace edits that have rendered but have
 * not reached the persistence effect yet. Initial offline startup still needs
 * the cache, and every online transition still reloads cloud state for rebase.
 */
export function shouldHydrateKitchen(isOnline: boolean, cloudReady: boolean) {
  return isOnline || !cloudReady
}

function defaultWait(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds))
}
