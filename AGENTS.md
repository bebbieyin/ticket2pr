# OpenAI Codex Instructions

Use these rules when working on Ticket2PR automation tasks with OpenAI Codex or another coding-agent provider.

## Change Scope

- Make the minimal focused change required by the ClickUp task.
- Follow existing project patterns and local conventions.
- Do not refactor unrelated code.
- Do not add features beyond the task acceptance criteria.
- Keep code simple and readable.

## Tests

- Add or update tests when the task requires coverage or the changed behavior would otherwise be unverified.
- Run the most relevant available checks.
- Report every test or check command that was run.
- If a test or check cannot be run, report the reason.

## Git

- Do not create commits unless the workflow explicitly asks.
- Do not open, merge, or close pull requests unless the workflow explicitly asks.
- The automation pipeline owns the final commit message format.
- If asked for a commit summary, keep it concise and specific to the ClickUp task.

## Output

When the implementation is complete, report:

- implementation summary
- files changed
- tests added or updated
- tests run
- known limitations or follow-up notes
