import type { DispatchInput, Env } from "./types";

export async function dispatchGitHubWorkflow(
  input: DispatchInput,
  env: Env,
  fetchImpl: typeof fetch,
): Promise<void> {
  const repo = normalizeRepoName(env.GITHUB_REPO);
  const response = await fetchImpl(
    `https://api.github.com/repos/${env.GITHUB_OWNER}/${repo}/actions/workflows/${env.GITHUB_CHANGE_WORKFLOW_FILE}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${env.GH_PAT_TOKEN}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        ref: env.GITHUB_WORKFLOW_REF,
        inputs: {
          ...input,
          githubRepository: `${env.GITHUB_OWNER}/${repo}`,
          prBaseBranch: env.GITHUB_WORKFLOW_REF,
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`GitHub workflow dispatch failed with status ${response.status}`);
  }
}

function normalizeRepoName(repository: string): string {
  const trimmed = repository.trim().replace(/\/+$/, "");
  if (trimmed.includes("github.com/")) {
    const parts = trimmed.split("/");
    return parts[parts.length - 1] ?? trimmed;
  }

  if (trimmed.includes("/")) {
    const parts = trimmed.split("/");
    return parts[parts.length - 1] ?? trimmed;
  }

  return trimmed;
}
