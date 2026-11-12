[English](SECURITY.md) | [Türkçe](SECURITY.tr.md)

# Security and limitations

- Heartwood accepts HTTPS or loopback HTTP and supports peers on the same Matrix homeserver. It checks the Heartwood marker, invite-only membership, history visibility from joining, two-person membership, and Megolm on the relevant operations. Rooms are created with federation disabled. The client sends text only as encrypted events and checks blocking, membership and sender-device trust when reading history.
- Compare the full device code, account and device ID over a trusted second channel. The SHA-256 code derives from both public keys. Pinning requires one current device. Sending stops on key changes, missing verification or encryption, multiple devices, or an unexpected key recipient. Existing device pins cannot be replaced in place. A device that already received a room key may retain access. Blocking leaves previously received content accessible.
- Matrix still sees metadata such as membership, device IDs, timing, IP addresses and traffic volume. The endpoint, operating system user, terminal history and screen are within the trust boundary. Account passwords, access tokens and decrypted messages are kept off disk by Heartwood. Local profiles retain device IDs, public key pins, blocklists, sync cursors and pending invitation IDs. Losing the key store can prevent recovery of older messages.
- Live catch-up depends on history the server retains and the account may access. After encrypted events fall out of the live retry buffer, try fetching them through history. The client is scoped to a controlled two-account scenario with one device per person. Key backup, federation, multiple devices, voice and file transfer are outside that scope.
- Multiline paste protection requires a terminal that marks the paste boundaries. Linux PTY and Windows ConPTY tests inject explicit bracketed paste markers. Paste behavior without those markers depends on the terminal frontend.

Keep real credentials, tokens, keys, profiles and private messages out of Git, logs and issue reports. The disposable lab displays its short-lived registration token locally.

Search text, results, display deduplication, and unread tracking are held in memory. Leaving a chat releases its search references. JavaScript offers no guarantee of physical memory erasure. The local removal command deletes verified profile files through normal filesystem operations. An interruption during removal can leave an isolated `.removed-*` directory under the profile root for manual inspection.

[Setup and usage](README.md) · [Architecture](ARCHITECTURE.md)
