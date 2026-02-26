# Change Log

All notable changes to the "telecode-ai" extension will be documented in this file.

## [0.1.12]

- **WhatsApp Engine Migration**: Completely replaced heavy Puppeteer/Chrome headless initialization with lightweight WebSockets via `@whiskeysockets/baileys`.
- **Typing Indicators**: The AI now displays a real-time "typing..." ("composing") status in WhatsApp when it’s actively thinking/running tasks.
- **Connection Stability**: Fixed the 405 Connection Failure issues by emulating modern WhatsApp Web handshakes (`fetchLatestBaileysVersion()`, desktop browser spoofing). Disconnected sessions correctly handle stop events without falling into an infinite reconnect loop.
- **QR Code Rendering**: Fixed auth payload payload format to natively render QR codes in the VS Code Webview as SVG.

## [0.1.9]

- **Extension Icon**: Fixed SVG geometry and added `viewBox` for correct rendering in the VS Code Activity Bar.
- **Chat UI Refinement**:
  - Redesigned chat interface with a clean, minimalist aesthetic.
  - Introduced compact control variants to improve UI density.
  - Implemented channel-specific message themes (blue for Telegram, green for WhatsApp).
- **Architecture**: Refactored and decomposed large modules (Messaging Repository, Routing) into smaller, more maintainable components.
- **Documentation**: Streamlined `README.md` by moving specific version highlights to the Change Log.

## [0.1.8]

- Unified top control flow: one Start/Stop toggle now controls runtime + enabled channels.
- Added WhatsApp access policy settings: `self`, `allowlist`, `all`, plus allowlist phone list.
- Hardened Telegram startup path (preflight + non-blocking polling start behavior).
- Improved grouped logs with clearer channel filtering and reduced noisy prefixes.
- Polished Settings UX (aligned Save button, safer placeholders, clearer channel hints).
- Updated About and landing copy to match current capabilities.

## [0.1.0]

- Initial MVP release.
- Added pi-agent-core and pi-ai integration.
- Added native coding tools (ReadFile, WriteFile, EditFile, Glob, Grep, Bash).
- Integrated Telegram bot for remote management and background execution.
- Added dynamic i18n localization (English and Russian).
