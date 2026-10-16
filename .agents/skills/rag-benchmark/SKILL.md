---
name: rag-benchmark
description: Benchmark and regression testing workflow for the local in-memory BM25 retrieval engine. Use when modifying retrieval.ts, tokenization algorithms, search queries, synonyms, or chunk boundaries.
---

# RAG Benchmark and Regression Testing Workflow

This skill guides the agent in testing and maintaining the quality of the in-memory BM25 retrieval engine in **Armonia Assistente**.

---

## 1. Retrieval Engine Architecture

The retrieval engine in `src/main/retrieval.ts`:
- Splits `DOCUMENTAZIONE_SCUOLA_MUSICA_ARMONIA.md` by Markdown headings (`##` and `###`).
- Normalizes text: case folding, accent stripping, punctuation removal.
- Applies domain-specific synonyms and query expansions (e.g., expanding tuition terms, instrument names, calendar dates).
- Ranks chunks using BM25 scoring and ensures co-retrieval (such as pairing tuition fees with annual registration fees).
- Enforces context character budgets (default 8,000, 16,000, or 24,000 chars) preserving line-number references.

---

## 2. Canonical Benchmark Test Cases

Whenever modifying `src/main/retrieval.ts`, verify that the top retrieved passages satisfy these 6 critical scenarios:

| # | Query | Required Content in Retrieved Chunks | Why it matters |
|---|---|---|---|
| 1 | *Quanto costa un anno di piano da 30 minuti?* | `€800` (tuition) AND `€60` (registration) | Ensures joint retrieval of base tuition and mandatory annual registration fee. |
| 2 | *Posso iniziare piano martedì alle 18:00?* | `17:00–19:00` AND `Ada Ricci` | Teacher has theory class at that time; individual lessons cannot be scheduled. |
| 3 | *Ci sono posti liberi per batteria?* | `Completo; lista d’attesa` AND `15 ottobre 2026` | Distinguishes historical snapshot date from live real-time availability. |
| 4 | *Posso sommare sconto famiglia e secondo corso?* | `non si sommano` (or non-cumulative rule) | Prevents halluncination of cumulative discounts on the same fee. |
| 5 | *Il mio pagamento non compare nell'area allievi* | `Non effettuare un secondo pagamento` | Identifies security/privacy guardrails for personal financial records. |
| 6 | *E per 45 minuti?* (follow-up query) | `IND-45` (within Pianoforte) | Verifies conversational context carryover in short multi-turn questions. |

---

## 3. Step-by-Step Verification Procedure

1. **Run Vitest Retrieval Tests**:
   ```bash
   npm test tests/retrieval.test.ts
   ```

2. **Verify Line-Number Fidelity**:
   Ensure that chunk line numbers (`startLine` to `endLine`) match the exact source text in `DOCUMENTAZIONE_SCUOLA_MUSICA_ARMONIA.md`.

3. **Check Context Budget Compliance**:
   Ensure total length of returned sources does not exceed the requested character limit (`contextChars`).

4. **Verify Type Safety**:
   ```bash
   npm run typecheck
   ```
