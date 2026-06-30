---
name: verify-section
description: Verify a written section draft against its referenced source documents (CLAUDE.md, READMEs, issue body). Flags factual hallucinations, scope drift, formatting issues, and word-count violations. Run after /write-section.
---

STEP 1 — ask the user:
  "Which GitHub issue number should I verify?"
  Wait for the answer. Use it as ISSUE_NUMBER for all steps below.

STEP 2 — PREFERRED VERIFICATION PATH:
Before running the manual checklist below, try to invoke the
academic-paper skill in citation-check mode by using the Skill tool.
The skill name is "academic-paper" and the mode is "citation-check".

Feed it as input:
  - The draft at docs/drafts/issue-<ISSUE_NUMBER>.md
  - The full content of CLAUDE.md
  - The full content of every README listed in the issue's
    "Codebase references" field
  - The issue body itself (for content requirements and scope)

Instruct it explicitly:
  "This is NOT a journal article. This is a section of a CS degree
  project book. The 'sources' are internal codebase documents
  (CLAUDE.md, READMEs), not academic papers. Verify that every
  factual claim in the draft about the system is grounded in these
  internal sources. Flag any claim that is invented, contradicted
  by the sources, or where the sources disagree."

If academic-paper invokes successfully and produces a report, use
its output as the basis for the verification report below — fold
its findings into the appropriate checklist sections (A. Factual
Grounding especially).

If academic-paper does NOT invoke (the Skill tool call fails or is
skipped), proceed directly to STEP 3 and run the manual checklist.
Do not stop — fall through to manual verification, which is
sufficient on its own.

STEP 3 — load all source-of-truth documents (do this regardless of
whether STEP 2 succeeded):
  - The draft: docs/drafts/issue-<ISSUE_NUMBER>.md
  - The issue itself: gh issue view <ISSUE_NUMBER> --json title,body
  - Every file listed under "Codebase references" in the issue body
  - CLAUDE.md
  - docs/task_board.md (for scope boundaries with adjacent sections)

STEP 4 — run the verification checklist below. For each item, produce
a specific finding with line numbers or quotes — not generic comments.

═══════════════════════════════════════════════════════
VERIFICATION CHECKLIST
═══════════════════════════════════════════════════════

A. FACTUAL GROUNDING (highest priority — these are blockers)
  A1. For every factual claim in the draft about the system
      (endpoints, request/response shapes, class names, module
      names, parameter names, design patterns, data flows):
      → Find a matching reference in CLAUDE.md or a referenced README
      → If no match exists: flag as INVENTED
      → If references disagree with the draft: flag as CONTRADICTION
      → If references disagree with each other: flag as SOURCE CONFLICT
  A2. Check named entities specifically — class names, function names,
      database tables, environment variables, library names. Each must
      appear verbatim in at least one reference document.

B. SCOPE DISCIPLINE
  B1. Does the draft stay inside the section's defined scope per the
      issue and task_board.md?
  B2. Specifically: does it leak content that belongs to an adjacent
      section? (e.g. 3.1 Architecture leaking 3.3 Implementation
      details; 1.1 Background leaking 1.2 Problem Statement)

C. STRUCTURE & FORMATTING
  C1. Heading format: ## 1.1 Background  (NO period after the numeral)
  C2. Plain text body, blank line between paragraphs
  C3. Code indented 4 spaces, not backticks
  C4. IEEE citations [N] only if section references external sources
  C5. Diagram placeholder is *[INSERT DIAGRAM HERE]* exactly

D. TONE & PERSON
  D1. Formal academic English, third person throughout
  D2. No first-person ("we", "our", "I", "us")
  D3. No contractions, no informal phrasing

E. WORD COUNT
  E1. Within ±10% of the target from the issue → PASS
  E2. Within ±15% → MINOR WARNING
  E3. Beyond ±15% → BLOCKER (indicates scope leak or under-development)

═══════════════════════════════════════════════════════

STEP 5 — print the verification report to the terminal in this format:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 VERIFICATION REPORT — issue-<ISSUE_NUMBER>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SECTION:     [section title]
DRAFT FILE:  docs/drafts/issue-<ISSUE_NUMBER>.md
WORD COUNT:  [actual] / [target] ([deviation]%)

A. FACTUAL GROUNDING
   [List each finding with severity tag and specific evidence:
    🔴 INVENTED:        "The draft mentions <X>. This does not appear
                         in CLAUDE.md or <referenced README>."
    🔴 CONTRADICTION:   "The draft says <X>. CLAUDE.md §<N> says <Y>."
    🟡 SOURCE CONFLICT: "CLAUDE.md says <X>. README says <Y>. Draft
                         used <Z>. Need team clarification."
    ✅ GROUNDED:        only mention overall pass status, not every
                         grounded claim]

B. SCOPE DISCIPLINE
   [Specific findings or ✅ PASS]

C. STRUCTURE & FORMATTING
   [Specific findings or ✅ PASS]

D. TONE & PERSON
   [Specific findings or ✅ PASS]

E. WORD COUNT
   [✅ PASS / 🟡 MINOR / 🔴 BLOCKER with exact numbers]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERDICT:
  🟢 READY TO PASTE       — no blockers, only minor warnings if any
  🟡 MINOR FIXES NEEDED   — fix warnings then paste, or paste as-is
  🔴 BLOCKERS — DO NOT PASTE  — must be resolved first

PRIORITY FIX LIST (in order):
  1. [highest-impact fix]
  2. [next]
  3. [next]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 6 — based on verdict:

IF VERDICT IS 🟢 READY TO PASTE:
  Add a comment and close the issue:
  gh issue comment <ISSUE_NUMBER> --body "✅ Verification passed — ready to paste into Google Docs."
  gh issue close <ISSUE_NUMBER>

IF VERDICT IS 🟡 MINOR FIXES NEEDED:
  Offer the user a choice:
  "Found minor issues. Want me to fix them automatically in the draft,
   or do you want to fix manually?"
  - If automatic: apply the fixes to docs/drafts/issue-<ISSUE_NUMBER>.md,
    then add a comment and close the issue
  - If manual: print the fix list and leave the issue open

IF VERDICT IS 🔴 BLOCKERS:
  Do NOT modify the draft. Do NOT close the issue.
  Print: "Blockers found — rerun /write-section with corrected
  context, or update the source documents (CLAUDE.md / READMEs) if
  the draft is right and the references are stale."
  Add a comment to the issue:
  gh issue comment <ISSUE_NUMBER> --body "🔴 Verification failed — blockers found. See verification report."