# Failure exercise: duplicate event

1. Deliver the same SSE event ID twice to a test client.
2. Observe task state after the first and second delivery.
3. Expected: the second delivery is ignored by the client and does not create a duplicate task or regress a newer task version.

This demonstrates at-least-once delivery handling, not exactly-once delivery.
