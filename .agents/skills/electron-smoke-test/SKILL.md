---
name: electron-smoke-test
description: Procedure for running and diagnosing Playwright-based Electron desktop smoke tests and packaged installer verification. Use when testing app packaging, IPC bridges, safeStorage, or mock LM Studio connectivity.
---

# Electron Desktop Smoke Testing and Release Runbook

This skill outlines how to run and debug end-to-end smoke tests on the compiled Electron application and its release artifacts.

---

## 1. Test Architecture & Prerequisites

The test suite uses **Playwright** with the built-in Electron runner (no standalone browser installation required).

- **Prerequisites**:
  - Application must be built before testing:
    ```bash
    npm run build
    ```
  - A graphical display session (e.g. Windows GUI session) is required.
  - The script uses an isolated user data directory under `%TEMP%/opencode` so the developer's everyday settings are never modified.

---

## 2. Desktop Smoke Test (`npm run test:desktop`)

Executes `scripts/desktop-smoke.mjs`:
- Launches an internal mock HTTP server that simulates LM Studio on an ephemeral port.
- Opens the compiled Electron app (`out/main/index.js`).
- Tests end-to-end interactions:
  1. Opening Settings and saving server URL / API key (verifies Electron `safeStorage`).
  2. Testing `/v1/models` fetching and model auto-selection.
  3. Sending a prompt and receiving streaming SSE chunks.
  4. Testing citation popups (`[S1]`, `[S2]`) with line-number references.
  5. Testing the "Interrompi" (Abort) button and connection failure recovery.
  6. Testing "Ricarica documento" (in-memory knowledge reload).

Run command:
```bash
npm run test:desktop
```

---

## 3. Packaged Installer Smoke Test (`npm run test:packaged`)

Executes `scripts/packaged-smoke.mjs`:
- Verifies the compiled Windows executable in `release/win-unpacked/` or NSIS installer `release/`.
- Confirms the presence of `DOCUMENTAZIONE_SCUOLA_MUSICA_ARMONIA.md` inside `resources/`.
- Verifies that `package.json` configurations (appId, metadata, extraResources) match release expectations.

Run commands:
```bash
# Build the NSIS Windows installer
npm run dist:win

# Verify packaged artifacts
npm run test:packaged
```

---

## 4. Troubleshooting Common Issues

| Issue | Root Cause | Solution |
|---|---|---|
| *Playwright cannot connect to Electron* | Outdated build files in `out/` | Run `npm run build` prior to starting smoke test. |
| *Failed to create test directory* | `%TEMP%/opencode` does not exist or lacks write permissions | Ensure the `%TEMP%/opencode` directory exists. |
| *safeStorage encryption failure* | OS environment lacks DPAPI or keychain access | On headless/CI runners, ensure a mock desktop session is available. |
| *Mock server port conflict* | Port already in use | The test script binds to a random free port; check for firewall blocks on localhost. |
