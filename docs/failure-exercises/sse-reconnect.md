# Failure exercise: SSE reconnect and replay gap

1. Connect two authenticated users to the same workspace and note the first SSE event ID.
2. Disconnect one browser tab.
3. Create and update tasks from the other user while the first tab is offline.
4. Reconnect the first tab with its browser-managed `Last-Event-ID`.
5. Expected: retained events are replayed and applied once. If the cursor is older than the 1,000-entry retention window, the client receives `resync-required` and refetches tasks.

Record received event IDs and whether the result was replay or resync. Do not claim zero loss without testing the retention-expiry branch.
