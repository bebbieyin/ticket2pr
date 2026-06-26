import { addClickUpComment, fetchClickUpTask, formatMissingFieldsComment, validateTask } from "./clickup";
import { dispatchGitHubWorkflow } from "./github";
import type { ClickUpWebhookPayload, Env } from "./types";

type HandlerDeps = {
  fetchImpl?: typeof fetch;
  log?: (message: string, meta?: Record<string, unknown>) => void;
};

export function createWebhookHandler(deps: HandlerDeps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const log = deps.log ?? defaultLogger;

  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      if (request.method === "GET") {
        return jsonResponse(200, { ok: true });
      }

      if (request.method !== "POST") {
        return jsonResponse(405, { error: "Method not allowed" });
      }

      const rawBody = await request.text();
      const signature = request.headers.get("X-Signature");

      if (!(await verifySignature(env.CLICKUP_WEBHOOK_SECRET, rawBody, signature))) {
        log("invalid_signature");
        return jsonResponse(401, { error: "Invalid signature" });
      }

      let payload: ClickUpWebhookPayload;
      try {
        payload = JSON.parse(rawBody) as ClickUpWebhookPayload;
      } catch {
        return jsonResponse(400, { error: "Invalid JSON payload" });
      }

      const transition = getInDevelopmentTransition(payload, env.CLICKUP_IN_DEVELOPMENT_STATUS);
      if (!transition.matches) {
        log("ignored_event", {
          event: payload.event ?? null,
          reason: transition.reason,
          taskId: payload.task_id ?? null,
        });
        return jsonResponse(202, { ignored: true, reason: transition.reason });
      }

      const dedupeKey = buildDedupeKey(payload, transition.beforeStatus, transition.afterStatus);
      const alreadyProcessed = await env.WEBHOOK_DEDUPE.get(dedupeKey);
      if (alreadyProcessed) {
        log("duplicate_event", { dedupeKey, taskId: payload.task_id });
        return jsonResponse(202, { duplicate: true });
      }

      const task = await fetchClickUpTask(payload.task_id as string, env, fetchImpl);
      const validation = validateTask(task, env);

      if (!validation.ok) {
        await addClickUpComment(task.id, formatMissingFieldsComment(validation.missingFields), env, fetchImpl);
        log("task_validation_failed", {
          taskId: task.id,
          missingFields: validation.missingFields,
        });
        return jsonResponse(422, {
          error: "Missing required ClickUp fields",
          missingFields: validation.missingFields,
        });
      }

      await env.WEBHOOK_DEDUPE.put(dedupeKey, "1", {
        expirationTtl: getDedupeTtl(env),
      });

      try {
        await dispatchGitHubWorkflow(validation.input, env, fetchImpl);
      } catch (error) {
        if (env.WEBHOOK_DEDUPE.delete) {
          await env.WEBHOOK_DEDUPE.delete(dedupeKey);
        }

        log("github_dispatch_failed", {
          taskId: task.id,
          dedupeKey,
          error: toErrorMessage(error),
        });
        return jsonResponse(502, { error: "GitHub workflow dispatch failed" });
      }

      log("workflow_dispatched", {
        taskId: task.id,
        dedupeKey,
      });

      return jsonResponse(202, { dispatched: true, taskId: task.id });
    },
  };
}

export async function verifySignature(secret: string, body: string, signature: string | null): Promise<boolean> {
  if (!secret || !signature) {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const expected = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");

  return expected === signature.toLowerCase();
}

export function getInDevelopmentTransition(payload: ClickUpWebhookPayload, targetStatus: string) {
  if (payload.event !== "taskStatusUpdated") {
    return { matches: false, reason: "unsupported_event" } as const;
  }

  const historyItem = payload.history_items?.find((item) => item.field === "status");
  const beforeStatus = normalizeStatus(historyItem?.before?.status);
  const afterStatus = normalizeStatus(historyItem?.after?.status);
  const expectedStatus = normalizeStatus(targetStatus);

  if (!afterStatus || afterStatus !== expectedStatus) {
    return { matches: false, reason: "target_status_not_reached" } as const;
  }

  if (beforeStatus === afterStatus) {
    return { matches: false, reason: "status_unchanged" } as const;
  }

  return {
    matches: true,
    beforeStatus,
    afterStatus,
  } as const;
}

function buildDedupeKey(payload: ClickUpWebhookPayload, beforeStatus: string, afterStatus: string): string {
  const historyId = payload.history_items?.find((item) => item.field === "status")?.id;
  if (historyId) {
    return `clickup:${payload.webhook_id ?? "unknown"}:${historyId}`;
  }

  return `clickup:${payload.task_id}:${beforeStatus}:${afterStatus}`;
}

function normalizeStatus(status: string | null | undefined): string {
  return (status ?? "").trim().toLowerCase();
}

function getDedupeTtl(env: Env): number {
  const parsed = Number(env.WEBHOOK_DEDUPE_TTL_SECONDS ?? "86400");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 86400;
}

function jsonResponse(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function defaultLogger(message: string, meta?: Record<string, unknown>) {
  console.log(JSON.stringify({ message, ...meta }));
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
