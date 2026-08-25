# No-Credit Subscription Fallback Design

## Scope

When a user has no update credits and a newer batch date is active, keep serving the user's last successfully pulled batch instead of returning HTTP 402 immediately. Same-day refreshes, free-period access, paid batch locks, and users with available credits keep their existing behavior.

## Batch Selection

The subscription route first resolves the active batch and any paid lock. For a non-locked user with no free period and zero credits, it loads `lastPulledBatchId` and uses that batch only when its `batchDate` matches `lastPulledBatchDate` and it contains nodes. This preserves the user's last known working subscription without changing their credit balance. If the historical batch is unavailable or inconsistent, the normal credit gate returns 402.

## Data Flow And Errors

The fallback batch follows the existing downstream serialization and pull-record path. Because its date matches the user's recorded date, the credit transaction does not consume a credit or advance the user's batch pointer. A missing historical batch is treated as an integrity failure rather than silently serving an arbitrary batch.

## Testing

Unit tests cover cross-date fallback, missing or mismatched historical batches, same-day access, paid locks, free periods, and users with credits. Existing subscription route and synchronization tests remain unchanged.
