---
name: write-section
description: Write an assigned project book section from a GitHub issue, save as markdown, and print Google Docs paste instructions. Single-shot — no skill chaining.
---

STEP 1 — ask the user:
  "Which GitHub issue number should I work on?"
  Wait for the answer. Use it as ISSUE_NUMBER for all steps below.

STEP 2 — fetch the issue:
gh issue view <ISSUE_NUMBER> --json title,body,assignees

STEP 3 — read every file listed under "Codebase references" in the
issue body. Also read CLAUDE.md if not already listed.

STEP 4 — read docs/task_board.md to understand the full book
structure and where this section sits relative to all other sections.

STEP 5 — write the section. These rules are STRICT, not suggestions:

GROUNDING (this is the most important rule):
- Every factual claim about the system MUST be traceable to a specific
  line in CLAUDE.md or a referenced README. If you cannot point to
  a source for a claim, do not write it.
- Do NOT invent endpoint names, request/response bodies, class names,
  module names, parameter names, or design patterns that do not appear
  verbatim in the referenced documents.
- If the issue asks for content that isn't in the referenced
  documents, write [NEEDS INPUT — pending team clarification] in place
  of the missing detail. Do not fill the gap with plausible-sounding
  invention.
- If two referenced documents contradict each other, write both
  versions with [NEEDS INPUT — sources disagree: CLAUDE.md says X,
  README says Y] rather than picking one.

SCOPE DISCIPLINE:
- Stay inside the section's scope per the issue. If the issue is
  3.1 Architecture, do NOT include implementation-level details
  (specific class names, circuit-breaker parameters, container slot
  names) — those belong in 3.3 Implementation Details.

STYLE:
- Formal academic English, third person throughout
- No first-person ("we", "our", "I") — use passive voice or "the system"
- No informal phrasing or contractions
- Target the word count from the issue ±10%. If you go more than 15%
  over, you are including out-of-scope detail — cut it.

FORMATTING (exact, no deviation):
- Chapter title heading: # 1. Introduction   (no period after numeral)
- Section title heading: ## 1.1 Background   (no period after numeral)
- Subsection heading:    ### 1.1.1 Subtopic  (no period after numeral)
- Body paragraphs: plain text, one blank line between paragraphs
- Diagram placeholder: *[INSERT DIAGRAM HERE]*
- Code: indented 4 spaces, never backtick code blocks
- IEEE citations: [1], [2] as plain inline text — only if the section
  references external sources

STEP 6 — save to docs/drafts/issue-<ISSUE_NUMBER>.md

STEP 7 — print the following PASTE INSTRUCTIONS block to the terminal:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 PASTE INSTRUCTIONS — issue-<ISSUE_NUMBER>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WHAT:
  [Full section title from the issue, e.g. "1.1 Background"]

FILE TO OPEN:
  docs/drafts/issue-<ISSUE_NUMBER>.md

ONE-TIME SETUP (if not done yet):
  Google Docs → Tools → Preferences → check "Enable Markdown" → OK

WHERE TO PLACE YOUR CURSOR IN THE GOOGLE DOC:
  [Derive this from "Must be written after" in the issue body
   and the full structure in docs/task_board.md. Be explicit.]

  Option A — if this is the very first section in the document:
    → Click at the very beginning of the document

  Option B — if a previous section exists:
    → Press Ctrl+F
    → Search for: "[exact last heading of the previous section]"
    → Scroll to the END of that section's content
    → Click after the last word of that section
    → Press Enter once to create a blank line

HOW TO PASTE:
  1. Open docs/drafts/issue-<ISSUE_NUMBER>.md
  2. Select All (Ctrl+A) → Copy (Ctrl+C)
  3. In Google Docs, cursor positioned as above
  4. RIGHT-CLICK → "Paste from Markdown"
     ⚠ Do NOT use Ctrl+V — it pastes raw symbols

HOW TO VERIFY:
  → View → Show document outline (left sidebar)
  → Confirm "[section title]" appears in the outline
  → If missing: click the heading in the doc → Format dropdown
    → apply Heading 1 or Heading 2 manually

WORD COUNT:    [N words]
NEXT ISSUE:    [title and number of next section from task_board.md]

⚠ RECOMMENDED NEXT STEP:
  Run /verify-section <ISSUE_NUMBER> before pasting into Google Docs.
  This is especially important for sections with API details, code
  references, or factual claims about the system (Ch.3, Ch.4). For
  pure descriptive sections (background, motivation) it is optional.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 8 — do NOT close the issue yet. The issue stays open until
verification passes. Just add a comment:

gh issue comment <ISSUE_NUMBER> --body "📝 Draft written — saved to docs/drafts/issue-<ISSUE_NUMBER>.md. Awaiting /verify-section."