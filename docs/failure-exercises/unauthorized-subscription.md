# Failure exercise: unauthorized subscription

1. Authenticate as a member of Workspace B.
2. Request `/api/realtime?workspaceId=workspace-A`.
3. Expected: the route returns `403 Forbidden` and sends no workspace-A events.
4. Attempt a task mutation using a task ID from Workspace A.
5. Expected: the Server Action rejects it server-side even if the browser hides the control.

Repeat after removing the member and verify a new stream connection is rejected.
