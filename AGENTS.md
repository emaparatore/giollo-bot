# AI Agent Guidelines (AGENTS.md)

This document outlines the guidelines, architecture, and operational conventions for AI agents working on this codebase (**Armonia Assistente**).

---

## 1. Project Overview

**Armonia Assistente** is an Electron + React + TypeScript desktop application designed to let users query the handbook of the Accademia Musicale Armonia (a fictional music school) using a local LLM served via **LM Studio** (`http://localhost:1234/v1`).

### Key Features
- **Lightweight Local RAG:** In-memory BM25 retrieval directly indexing `DOCUMENTAZIONE_SCUOLA_MUSICA_ARMONIA.md` without external vector databases or embeddings.
- **Privacy & Security:** Fully local processing; sensitive credentials secured via Electron's `safeStorage` (Windows DPAPI); chat history stored exclusively in volatile memory.
- **Streaming & Citations:** Progressive responses via Server-Sent Events (SSE) with tracked source citations (`[S1]`, `[S2]`) and visibility into consulted guide passages.

---

## 2. Project Structure

```text
├── src/
│   ├── main/                  # Electron main process
│   │   ├── index.ts           # App lifecycle, window management, IPC registration
│   │   ├── retrieval.ts       # Markdown chunking, indexing, and BM25 search
│   │   └── llm.ts             # HTTP client for LM Studio, system prompt, SSE streaming
│   ├── preload/               # Secure context bridge between main and renderer
│   │   └── index.ts           # Type-safe IPC API exposure (window.api)
│   ├── renderer/              # Frontend UI (React 19, standard CSS, Lucide icons)
│   │   ├── src/
│   │   │   ├── App.tsx        # Main UI component (Chat, Sources, Settings)
│   │   │   ├── main.tsx       # React entry point
│   │   └── styles.css         # Global styles
│   │   └── index.html         # Host HTML file
│   └── shared/                # Shared TypeScript definitions
│       └── types.ts           # Interfaces for messages, sources, settings, IPC
├── tests/                     # Unit and integration test suite (Vitest)
│   ├── retrieval.test.ts      # Tests for BM25 logic and chunking
│   └── llm.test.ts            # Tests for LLM client and streaming with mock server
├── scripts/                   # Smoke test scripts (Playwright on Electron)
│   ├── desktop-smoke.mjs      # Desktop integration smoke tests with mock server
│   └── packaged-smoke.mjs     # Installer and release binary verification
├── DOCUMENTAZIONE_SCUOLA_MUSICA_ARMONIA.md  # Source document for RAG
├── electron.vite.config.ts    # electron-vite configuration (builds main, preload, renderer)
├── vitest.config.ts           # Vitest test configuration
└── package.json               # Dependencies and npm scripts
```

---

## 3. Development and Verification Commands

Agents must verify changes before considering a task complete:

| Command | Description |
|---|---|
| `npm run typecheck` | Run static TypeScript checks (`tsc --noEmit`). |
| `npm test` | Run unit and integration tests with Vitest. |
| `npm run build` | Perform typecheck and build full output into `out/`. |
| `npm run dev` | Launch the app in development mode with hot reload. |
| `npm run test:desktop` | Run E2E smoke tests on the compiled Electron app (requires a GUI environment). |
| `npm run dist:win` | Build the Windows NSIS x64 installer in `release/`. |

---

## 4. Development Guidelines & Conventions

### Architecture and Process Separation
- **Electron Security:** The renderer process must never directly access Node.js or native OS APIs. All communication must occur through `contextBridge` in `src/preload/index.ts` and typed IPC channels in `src/shared/types.ts`.
- **RAG & BM25:** Any search or retrieval adjustments must reside in `src/main/retrieval.ts`. Preserve normalized tokenization, domain synonyms, and specific ranking boosts (e.g. tuition fees vs. annual registration fees).
- **Prompting & LLM:** System prompts and generation constraints reside in `src/main/llm.ts`. If guide sections or academic year dates change, synchronize temporal instructions in the system prompt.

### TypeScript & React Code Standards
- Maintain strict typing (`strict: true` in `tsconfig.json`). Avoid using `any`.
- Define new IPC channels or data structures in `src/shared/types.ts` first.
- The React UI (`src/renderer/`) must gracefully handle loading states, partial streaming, request cancellation (`AbortController`), and connection failures.

### Testing & Quality Assurance
- Always run static checks and unit tests before completing any logic change:
  ```bash
  npm run typecheck
  npm test
  ```
- Add new tests in `tests/` to cover new retrieval features or edge parsing cases.

### Documentation & Language
- The primary language of the domain documentation and end-user interface is **Italian**.
- Keep clear comments and preserve existing Markdown headings in `DOCUMENTAZIONE_SCUOLA_MUSICA_ARMONIA.md` (`##` and `###`).
