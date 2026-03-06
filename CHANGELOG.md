# Change Log

All notable changes to the "telecode-ai" extension will be documented in this file.

## [0.1.19]

- **Native Toolchain Expansion**: Added two powerful zero-dependency tools that significantly expand autonomous capabilities:
  - `fetch_url`: Empowers the agent to read readable text from any HTTP website without relying on external APIs.
  - `diagnostics`: Allows the agent to instantly read VS Code TypeScript/ESLint errors without running compilers, dramatically speeding up the debug loop.
- **Default Tools**: Enabled `Fetch` and `Diagnostics` as default tools for balanced and power mode profiles.

## [0.1.18]

- **WhatsApp Enhancements**: Added logging of WhatsApp tool invocations directly into the task timeline for better traceability.
- **Log Management**: Renamed channel log retention settings and unified them to be shared across all communication channels.
- **Maintenance**: Refined runtime/config cleanup processes and standardized TypeScript formatting across the codebase.

## [0.1.17]

- **Compatibility**: Downgraded VS Code engine requirement and `@types/vscode` to `^1.107.0` to ensure full compatibility with AntiGravityIDE.
- **Documentation**: Updated `AGENTS.md` to include comprehensive Git workflow guidelines for the autonomous agent.

## [0.1.16]

- **Build Fix**: Resolved extension activation crash (`Cannot find module 'qrcode'`) by explicitly bundling `@whiskeysockets/baileys`, `qrcode`, and `pino` directly into the extension artifact.

## [0.1.15]

- **Panel Onboarding UX**: Added a multilingual info tooltip next to the main header brand to clarify the agent's primary control interface (WhatsApp & Telegram), with refined, glitch-free hover logic for reading tooltip copy.

## [0.1.14]

- **WhatsApp Onboarding**: Injected explicit UI hints in the Settings tab to guide users on correctly starting the agent and scanning the QR code inside the "Logs" tab.

## [0.1.13]

- **Security Awareness**: Highlighted the `Access Mode` field with stark warnings (`Safest` vs `DANGEROUS`) to prevent users from accidentally exposing the autonomous bash execution to arbitrary strangers.
- **Settings Cleanup**: Removed archaic `Recovery On Auth` flags leftover from the Puppeteer architecture, streamlining configuring and the runtime payload.

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
