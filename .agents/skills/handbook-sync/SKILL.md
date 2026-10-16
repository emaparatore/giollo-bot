---
name: handbook-sync
description: Runbook for updating or editing the school handbook (DOCUMENTAZIONE_SCUOLA_MUSICA_ARMONIA.md) and synchronizing system prompt constraints in src/main/llm.ts. Use whenever the handbook or academic year rules change.
---

# Handbook Sync and Prompt Alignment Runbook

This skill outlines the strict procedure for modifying `DOCUMENTAZIONE_SCUOLA_MUSICA_ARMONIA.md` while ensuring the RAG chunker and system prompt in `src/main/llm.ts` remain synchronized.

---

## 1. Markdown Formatting Constraints

The RAG chunker in `src/main/retrieval.ts` relies on specific document formatting:

1. **Heading Structure**:
   - Use `##` for major chapters / topical sections.
   - Use `###` for specific subsections (e.g., individual courses, fees, regulations).
   - Do NOT skip heading levels or introduce unheaded introductory paragraphs at the top of sections.

2. **Tables**:
   - Preserve pipe table format (`| Col1 | Col2 |`).
   - Keep header divider lines (`|---|---|`) intact. Chunker groups tables with their respective subsection.

3. **Snapshots and Dates**:
   - Keep status snapshot dates explicit (e.g. `Situazione al 15 ottobre 2026`) so the LLM recognizes static snapshots rather than real-time data.

---

## 2. System Prompt Synchronization Checklist (`src/main/llm.ts`)

Whenever changing academic dates, fees, or policy rules in the handbook, check and update `src/main/llm.ts` (`buildMessages` function):

- [ ] **Academic Year Reference**: Update the year (currently `2026–2027`).
- [ ] **Discount Deadlines**: Update expired discount dates (e.g., early payment discount expired on `7 settembre 2026`).
- [ ] **Availability Guardrails**: Re-confirm instruction that slots and rentals are fixed snapshots, not live bookings.
- [ ] **Calculation Rules**: Ensure prompt rules for residual lessons, trial lesson credits, and deposits match updated handbook terms.

---

## 3. Verification Steps

After updating both files:

```bash
# 1. Verify TypeScript types and prompt compilation
npm run typecheck

# 2. Run retrieval and LLM unit tests
npm test

# 3. If in development, trigger "Ricarica documento" in the UI to verify in-memory index reload
```
