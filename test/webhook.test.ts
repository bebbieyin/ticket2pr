import { describe, expect, it } from "vitest";
import { createWebhookHandler, verifySignature } from "../src/webhook";
import type { Env, KVNamespaceLike } from "../src/types";

class MemoryKV implements KVNamespaceLike {
  private readonly data = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }
}

function createEnv(overrides: Partial<Env> = {}): Env {
  return {
    CLICKUP_TOKEN: "clickup-token",
    CLICKUP_WEBHOOK_SECRET: "secret",
    CLICKUP_IN_DEVELOPMENT_STATUS: "IN DEVELOPMENT",
    CLICKUP_TARGET_BRANCH_FIELD_ID: "target-branch",
    CLICKUP_GITHUB_REVIEWER_FIELD_ID: "reviewer",
    CLICKUP_PROBLEM_STATEMENT_FIELD_ID: "problem",
    CLICKUP_EXPECTED_BEHAVIOR_FIELD_ID: "expected",
    CLICKUP_CURRENT_BEHAVIOR_FIELD_ID: "current",
    CLICKUP_CONTEXT_OR_REPRO_STEPS_FIELD_ID: "context",
    CLICKUP_RELEVANT_LINKS_FIELD_ID: "links",
    CLICKUP_ACCEPTANCE_CRITERIA_FIELD_ID: "acceptance",
    CLICKUP_TEST_EXPECTATIONS_FIELD_ID: "tests",
    CLICKUP_TASK_TYPE_FIELD_ID: "task-type",
    GITHUB_OWNER: "acme",
    GITHUB_REPO: "ticket2pr",
    GITHUB_WORKFLOW_REF: "main",
    GITHUB_CHANGE_WORKFLOW_FILE: "ticket2pr-change.yml",
    GH_PAT_TOKEN: "gh-token",
    WEBHOOK_DEDUPE_TTL_SECONDS: "300",
    WEBHOOK_DEDUPE: new MemoryKV(),
    ...overrides,
  };
}

async function signedRequest(body: string, env: Env): Promise<Request> {
  const signature = await sign(env.CLICKUP_WEBHOOK_SECRET, body);
  return new Request("https://example.com/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Signature": signature,
    },
    body,
  });
}

async function sign(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function createTaskResponse() {
  return {
    id: "CU-123",
    url: "https://app.clickup.com/t/CU-123",
    custom_fields: [
      { id: "problem", value: "Broken thing" },
      { id: "expected", value: "Should work" },
      { id: "current", value: "Does not work" },
      { id: "context", value: "Step 1, Step 2" },
      { id: "links", value: "https://example.com/log" },
      { id: "acceptance", value: "All green" },
      { id: "tests", value: "Run unit tests" },
      { id: "target-branch", value: "feature/cu-123" },
      { id: "reviewer", value: "octocat" },
      {
        id: "task-type",
        value: "opt-1",
        type_config: {
          options: [{ id: "opt-1", name: "Bug" }],
        },
      },
    ],
  };
}

describe("webhook handler", () => {
  it("dispatches a valid IN DEVELOPMENT transition", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const env = createEnv();
    const handler = createWebhookHandler({
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init });

        if (String(url).includes("/api/v2/task/") && init?.method !== "POST") {
          return Response.json(createTaskResponse());
        }

        if (String(url).includes("/dispatches")) {
          return new Response(null, { status: 204 });
        }

        throw new Error(`Unexpected fetch: ${url}`);
      },
    });
    const payload = JSON.stringify({
      event: "taskStatusUpdated",
      task_id: "CU-123",
      webhook_id: "webhook-1",
      history_items: [
        {
          id: "history-1",
          field: "status",
          before: { status: "TO DO" },
          after: { status: "IN DEVELOPMENT" },
        },
      ],
    });

    const response = await handler.fetch(await signedRequest(payload, env), env);

    expect(response.status).toBe(202);
    expect(calls).toHaveLength(2);
    const dispatchBody = JSON.parse(String(calls[1]?.init?.body));
    expect(dispatchBody.ref).toBe("main");
    expect(dispatchBody.inputs.clickupTaskId).toBe("CU-123");
    expect(dispatchBody.inputs.githubReviewerUsername).toBe("octocat");
    expect(dispatchBody.inputs.targetBranch).toBe("feature/cu-123");
  });

  it("ignores unsupported events", async () => {
    const env = createEnv();
    const handler = createWebhookHandler();
    const payload = JSON.stringify({
      event: "taskUpdated",
      task_id: "CU-123",
      history_items: [],
    });

    const response = await handler.fetch(await signedRequest(payload, env), env);

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ ignored: true });
  });

  it("comments and rejects when required fields are missing", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const env = createEnv();
    const handler = createWebhookHandler({
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init });

        if (String(url).includes("/api/v2/task/") && init?.method !== "POST") {
          const task = createTaskResponse();
          task.custom_fields = task.custom_fields.filter((field) => field.id !== "reviewer");
          return Response.json(task);
        }

        if (String(url).includes("/comment")) {
          return new Response(null, { status: 200 });
        }

        throw new Error(`Unexpected fetch: ${url}`);
      },
    });
    const payload = JSON.stringify({
      event: "taskStatusUpdated",
      task_id: "CU-123",
      history_items: [
        {
          id: "history-1",
          field: "status",
          before: { status: "TO DO" },
          after: { status: "IN DEVELOPMENT" },
        },
      ],
    });

    const response = await handler.fetch(await signedRequest(payload, env), env);

    expect(response.status).toBe(422);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.url).toContain("/comment");
  });

  it("does not dispatch duplicates", async () => {
    const env = createEnv();
    await env.WEBHOOK_DEDUPE.put("clickup:webhook-1:history-1", "1");
    const handler = createWebhookHandler({
      fetchImpl: async () => {
        throw new Error("fetch should not run for duplicates");
      },
    });
    const payload = JSON.stringify({
      event: "taskStatusUpdated",
      task_id: "CU-123",
      webhook_id: "webhook-1",
      history_items: [
        {
          id: "history-1",
          field: "status",
          before: { status: "TO DO" },
          after: { status: "IN DEVELOPMENT" },
        },
      ],
    });

    const response = await handler.fetch(await signedRequest(payload, env), env);

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ duplicate: true });
  });

  it("returns 502 and clears dedupe on dispatch failure", async () => {
    const env = createEnv();
    const handler = createWebhookHandler({
      fetchImpl: async (url, init) => {
        if (String(url).includes("/api/v2/task/") && init?.method !== "POST") {
          return Response.json(createTaskResponse());
        }

        if (String(url).includes("/dispatches")) {
          return new Response("boom", { status: 500 });
        }

        throw new Error(`Unexpected fetch: ${url}`);
      },
    });
    const payload = JSON.stringify({
      event: "taskStatusUpdated",
      task_id: "CU-123",
      webhook_id: "webhook-1",
      history_items: [
        {
          id: "history-1",
          field: "status",
          before: { status: "TO DO" },
          after: { status: "IN DEVELOPMENT" },
        },
      ],
    });

    const response = await handler.fetch(await signedRequest(payload, env), env);

    expect(response.status).toBe(502);
    await expect(env.WEBHOOK_DEDUPE.get("clickup:webhook-1:history-1")).resolves.toBeNull();
  });
});

describe("verifySignature", () => {
  it("accepts valid signatures", async () => {
    const body = JSON.stringify({ hello: "world" });
    const signature = await sign("secret", body);

    await expect(verifySignature("secret", body, signature)).resolves.toBe(true);
  });
});
