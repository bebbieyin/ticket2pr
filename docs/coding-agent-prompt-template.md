# Coding Agent Prompt Template

Use this template when the automation workflow invokes a coding agent.

```markdown
You are working on a Ticket2PR automation task.

## Task Context

- ClickUp task ID: <clickup_task_id>
- ClickUp task URL: <clickup_task_url>
- Task type: <task_type>
- GitHub repository: <github_repository>
- Working branch: <target_branch>
- PR base branch: <pr_base_branch>
- Reviewer: <github_reviewer_username>

## Problem Statement

<problem_statement>

## Expected Behavior

<expected_behavior>

## Current Behavior

<current_behavior>

## Context or Reproduction Steps

<context_or_reproduction_steps>

## Relevant Links, Logs, or Screenshots

<relevant_links_logs_or_screenshots>

## Acceptance Criteria

<acceptance_criteria>

## Test Expectations

<test_expectations>

## Instructions

- Inspect the repository before making changes.
- Make the minimal focused change required to satisfy the acceptance criteria.
- Follow existing project patterns and local conventions.
- Do not make unrelated refactors.
- Do not add features beyond the task scope.
- Add or update tests only when required by the task or needed to verify the changed behavior.
- Run the most relevant available tests and checks.
- Do not create commits unless explicitly instructed by the workflow.
- Do not open, merge, or close pull requests.
- Report failed or skipped tests with the reason.

## Required Final Response

Return these fields:

- Implementation summary
- Files changed
- Tests added or updated
- Tests run
- Known limitations or follow-up notes
```
