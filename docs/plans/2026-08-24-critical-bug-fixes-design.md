# Critical Bug Fixes Design

## Scope

This change repairs confirmed failure modes without changing Arkadia's core pricing or batch-date billing model. Payment handling becomes recoverable when callbacks arrive late, proxy-pool records preserve the connection information required to use authenticated and TLS proxies, and operational checks distinguish a healthy application from a merely running process.

## Payment State Flow

Provider-query failures are treated as unknown and no longer expire orders. A valid signed callback or reconciliation result may deliver an expired order exactly once: the order row is locked, activation inventory is reclaimed, and the code or credits are issued in the same transaction. Reconciliation compares the provider amount with the stored amount. Refund initiation atomically moves a paid order to a refund-pending state and reserves the issued benefit before the external call. A failed external refund restores both the order and benefit; a successful call finalizes the state without a second benefit mutation.

## Proxy Pool Flow

Parsed records retain scheme, username, and password. The database identity includes protocol, endpoint, and credentials so HTTP/SOCKS variants do not collide. SOCKS5 authentication is negotiated during testing, HTTPS proxy connections use TLS before HTTP CONNECT, and generated subscription URIs include encoded credentials. Admin responses continue to omit secrets.

## Synchronization And Health

The upstream subscription is fetched and parsed before opening the publication transaction. The transaction acquires the advisory lock, re-checks configuration and schedule state, and only performs database reads/writes and activation. A health endpoint verifies database access, and Compose uses it for application health. Focused regression tests cover payment state transitions, proxy credential preservation, TLS/protocol identity, and empty filter results.
