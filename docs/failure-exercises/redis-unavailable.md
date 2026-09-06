# Failure exercise: Redis unavailable

1. Start the app with production Redis variables absent or point the configured client at an unavailable endpoint.
2. Attempt a task mutation and an authenticated realtime connection.
3. Expected: the mutation does not claim realtime success; the SSE route returns a controlled error or emits the safe realtime error message; logs contain the operation failure without credentials.
4. Restore Redis and repeat the read/mutation.
5. Expected: the app can serve again after the adapter reconnects or the process restarts; verify authoritative state with a fresh read.

Record environment, commit SHA, operation, status, and sanitized error class. Do not record tokens or cookies.
