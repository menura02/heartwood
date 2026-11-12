[English](ARCHITECTURE.md) | [Türkçe](ARCHITECTURE.tr.md)

# Architecture

The TypeScript terminal client uses the Matrix client API for authentication, invitations, sync, history, and encrypted events. The Matrix Rust SDK Node binding provides Olm/Megolm and stores keys in passphrase-protected SQLite. The disposable Synapse lab runs the server and stores events. The earlier WASM SDK evaluation required persistent IndexedDB, which the tested Node environment lacked.

- Each profile is bound to one server, user, and device. The SDK records keys before the profile saves its sync cursor and pending invitation IDs. Profile writes are atomic. SQLite provides the operating system lock on local storage. Takeover of a marked stale lock requires acquiring that lock. An ambiguous or unmarked legacy `in-use` directory stops startup. Confirm all clients have stopped before removing a verified empty legacy directory.
- Live chat opens history and forward reads at the same Matrix boundary. Each refresh processes sync and at most one forward page. Main-prompt history reads up to 50 Matrix events and holds a separate cursor per room. An empty page with a valid continuation can advance. A failed read or stalled cursor preserves the previous position.
- Conversation numbers stay stable while the same room and peer appear in consecutive lists. A retired number is never reassigned within the session. Opening a chat and sending recheck the selected room and peer.
- Live chat holds up to 512 recent event IDs, 64 forward cursors, and 50 encrypted events awaiting decryption. Transport and HTTP 502–504 errors get up to five automatic read attempts. Authorization and protocol errors pause reads. Exit cancels live reads and clears transient history and retry state.
- The chat view deduplicates history and live output against the last 2,048 displayed event IDs and retains up to 200 eligible plaintext messages for search. One in-chat history request can run alongside live polling. Leaving the chat cancels that request before another room opens. History retains cursors for up to 128 rooms and 128 recent cursor values per room.
- The existing sync stream tracks new activity in memory for up to 128 rooms, 256 outstanding IDs per room, and 4,096 recent IDs across rooms. The main prompt observes updates when a command syncs. Viewing a readable event clears that event locally. No read receipt is written.
- An uncertain send retains its transaction path, encrypted payload and recipient identity in memory. There is at most one pending send per room and up to 32 rooms. Retry uses the original transaction in the same session and checks room membership, blocking and device identity again. An event ID confirms server acceptance. Discard removes local tracking, and any server event remains. [Matrix transaction IDs](https://spec.matrix.org/latest/client-server-api/#transaction-identifiers)

[Setup and usage](README.md) · [Security and limitations](SECURITY.md)
