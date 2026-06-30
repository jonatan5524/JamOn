Use the academic-paper skill (from the academic-research-skills plugin)
to write my assigned section of the CS degree project book.

STEP 0 — ask the user:
  "Which GitHub issue number should I work on?"
  Wait for the answer. Use it as ISSUE_NUMBER for all steps below.

STEP 1 — fetch the issue:
gh issue view <ISSUE_NUMBER> --json title,body,assignees

STEP 2 — read every file listed under "Codebase references" in the
issue body. Also read CLAUDE.md if not already listed.

STEP 3 — read docs/task_board.md to understand the full book
structure and where this section sits relative to all other sections.

STEP 4 — write the section using the academic-paper skill's writing
mode:
- The issue body is your single source of truth: content requirements,
  key questions to answer, word count target, whether code/diagrams
  are needed, and the exact Google Doc heading to use
- Formal academic English, third person
- IEEE citations [N] where relevant
- If a diagram is needed add [INSERT DIAGRAM HERE] at the right place
- If code is needed indent 4 spaces (no backtick code blocks)
- Do NOT invent system details not found in the codebase files
- Mark anything missing from the codebase as [NEEDS INPUT]

STEP 5 — save to docs/drafts/issue-<ISSUE_NUMBER>.md
Use proper markdown formatting:
  - Chapter title → # (e.g. # 1. Introduction)
  - Section title → ## (e.g. ## 1.1 Background)
  - Subsection → ### if needed
  - Body paragraphs → plain text, one blank line between paragraphs
  - [INSERT DIAGRAM HERE] → *[INSERT DIAGRAM HERE]*
  - Code → indented 4 spaces
  - IEEE citations → [1], [2] as plain inline text

STEP 6 — after saving, print the following PASTE INSTRUCTIONS block
to the terminal:

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

WORD COUNT:  [N words]
NEXT ISSUE:  [title and number of next section from task_board.md]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 7 — close the issue:
gh issue comment <ISSUE_NUMBER> --body "✓ Draft complete — saved to docs/drafts/issue-<ISSUE_NUMBER>.md. Paste into Google Docs via right-click → Paste from Markdown."
gh issue close <ISSUE_NUMBER>