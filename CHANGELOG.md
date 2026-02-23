# Change Log

All notable changes to the "telecode-ai" extension will be documented in this file.

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
