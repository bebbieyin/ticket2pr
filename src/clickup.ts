import type {
  ClickUpCustomField,
  ClickUpTask,
  DispatchInput,
  Env,
  TaskType,
  ValidationResult,
} from "./types";

const TASK_TYPE_VALUES = new Set<TaskType>(["Bug", "Feature", "Enhancement", "Chore"]);

type RequiredFieldSpec = {
  label: string;
  envKey:
    | "CLICKUP_PROBLEM_STATEMENT_FIELD_ID"
    | "CLICKUP_EXPECTED_BEHAVIOR_FIELD_ID"
    | "CLICKUP_CURRENT_BEHAVIOR_FIELD_ID"
    | "CLICKUP_CONTEXT_OR_REPRO_STEPS_FIELD_ID"
    | "CLICKUP_RELEVANT_LINKS_FIELD_ID"
    | "CLICKUP_ACCEPTANCE_CRITERIA_FIELD_ID"
    | "CLICKUP_TEST_EXPECTATIONS_FIELD_ID"
    | "CLICKUP_TARGET_BRANCH_FIELD_ID"
    | "CLICKUP_GITHUB_REVIEWER_FIELD_ID";
  outputKey: keyof Omit<DispatchInput, "clickupTaskId" | "clickupTaskUrl" | "taskType" | "githubRepository" | "prBaseBranch">;
};

const REQUIRED_FIELD_SPECS: RequiredFieldSpec[] = [
  {
    label: "Problem Statement",
    envKey: "CLICKUP_PROBLEM_STATEMENT_FIELD_ID",
    outputKey: "problemStatement",
  },
  {
    label: "Expected Behavior",
    envKey: "CLICKUP_EXPECTED_BEHAVIOR_FIELD_ID",
    outputKey: "expectedBehavior",
  },
  {
    label: "Current Behavior",
    envKey: "CLICKUP_CURRENT_BEHAVIOR_FIELD_ID",
    outputKey: "currentBehavior",
  },
  {
    label: "Context or Reproduction Steps",
    envKey: "CLICKUP_CONTEXT_OR_REPRO_STEPS_FIELD_ID",
    outputKey: "contextOrReproductionSteps",
  },
  {
    label: "Relevant Links, Logs, or Screenshots",
    envKey: "CLICKUP_RELEVANT_LINKS_FIELD_ID",
    outputKey: "relevantLinksLogsOrScreenshots",
  },
  {
    label: "Acceptance Criteria",
    envKey: "CLICKUP_ACCEPTANCE_CRITERIA_FIELD_ID",
    outputKey: "acceptanceCriteria",
  },
  {
    label: "Test Expectations",
    envKey: "CLICKUP_TEST_EXPECTATIONS_FIELD_ID",
    outputKey: "testExpectations",
  },
  {
    label: "Target Branch",
    envKey: "CLICKUP_TARGET_BRANCH_FIELD_ID",
    outputKey: "targetBranch",
  },
  {
    label: "GitHub Reviewer Username",
    envKey: "CLICKUP_GITHUB_REVIEWER_FIELD_ID",
    outputKey: "githubReviewerUsername",
  },
];

export async function fetchClickUpTask(taskId: string, env: Env, fetchImpl: typeof fetch): Promise<ClickUpTask> {
  const response = await fetchImpl(`https://api.clickup.com/api/v2/task/${taskId}`, {
    headers: {
      Authorization: env.CLICKUP_TOKEN,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`ClickUp task fetch failed with status ${response.status}`);
  }

  return (await response.json()) as ClickUpTask;
}

export async function addClickUpComment(
  taskId: string,
  comment: string,
  env: Env,
  fetchImpl: typeof fetch,
): Promise<void> {
  const response = await fetchImpl(`https://api.clickup.com/api/v2/task/${taskId}/comment`, {
    method: "POST",
    headers: {
      Authorization: env.CLICKUP_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ comment_text: comment, notify_all: false }),
  });

  if (!response.ok) {
    throw new Error(`ClickUp comment failed with status ${response.status}`);
  }
}

export function validateTask(task: ClickUpTask, env: Env): ValidationResult {
  const missingFields: string[] = [];
  const output: Partial<DispatchInput> = {};

  for (const spec of REQUIRED_FIELD_SPECS) {
    const fieldId = env[spec.envKey];
    const value = getCustomFieldValue(task.custom_fields ?? [], fieldId);

    if (!value) {
      missingFields.push(spec.label);
      continue;
    }

    output[spec.outputKey] = value;
  }

  const taskType = resolveTaskType(task.custom_fields ?? [], env.CLICKUP_TASK_TYPE_FIELD_ID);
  if (!taskType) {
    missingFields.push("Task Type");
  }

  if (missingFields.length > 0) {
    return { ok: false, missingFields };
  }

  return {
    ok: true,
    input: {
      clickupTaskId: task.id,
      clickupTaskUrl: task.url ?? "",
      taskType: taskType as TaskType,
      githubRepository: "",
      prBaseBranch: "main",
      targetBranch: output.targetBranch as string,
      githubReviewerUsername: output.githubReviewerUsername as string,
      problemStatement: output.problemStatement as string,
      expectedBehavior: output.expectedBehavior as string,
      currentBehavior: output.currentBehavior as string,
      contextOrReproductionSteps: output.contextOrReproductionSteps as string,
      relevantLinksLogsOrScreenshots: output.relevantLinksLogsOrScreenshots as string,
      acceptanceCriteria: output.acceptanceCriteria as string,
      testExpectations: output.testExpectations as string,
    },
  };
}

export function formatMissingFieldsComment(missingFields: string[]): string {
  return `Ticket2PR could not start because these required fields are missing or empty: ${missingFields.join(", ")}.`;
}

function resolveTaskType(fields: ClickUpCustomField[], taskTypeFieldId?: string): TaskType | null {
  if (!taskTypeFieldId) {
    return "Chore";
  }

  const value = getCustomFieldValue(fields, taskTypeFieldId);
  if (!value || !TASK_TYPE_VALUES.has(value as TaskType)) {
    return null;
  }

  return value as TaskType;
}

function getCustomFieldValue(fields: ClickUpCustomField[], fieldId: string): string {
  const field = fields.find((item) => item.id === fieldId);
  if (!field) {
    return "";
  }

  return stringifyFieldValue(field).trim();
}

function stringifyFieldValue(field: ClickUpCustomField): string {
  const value = field.value;

  if (value === null || value === undefined) {
    return "";
  }

  const optionValue = resolveOptionValue(field, value);
  if (optionValue) {
    return optionValue;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => stringifyUnknown(item))
      .filter(Boolean)
      .join(", ");
  }

  return stringifyUnknown(value);
}

function resolveOptionValue(field: ClickUpCustomField, value: unknown): string {
  const options = field.type_config?.options ?? [];
  if (options.length === 0) {
    return "";
  }

  const match = options.find((option) => {
    return option.id === String(value) || String(option.orderindex ?? "") === String(value);
  });

  return match?.name?.trim() ?? "";
}

function stringifyUnknown(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => stringifyUnknown(item))
      .filter(Boolean)
      .join(", ");
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const preferredKeys = ["username", "name", "text", "url", "email"];

    for (const key of preferredKeys) {
      const nestedValue = record[key];
      if (typeof nestedValue === "string" && nestedValue.trim()) {
        return nestedValue;
      }
    }
  }

  return "";
}
