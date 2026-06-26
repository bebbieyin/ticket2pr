export type TaskType = "Bug" | "Feature" | "Enhancement" | "Chore";

export type KVNamespaceLike = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete?(key: string): Promise<void>;
};

export type Env = {
  CLICKUP_TOKEN: string;
  CLICKUP_WEBHOOK_SECRET: string;
  CLICKUP_IN_DEVELOPMENT_STATUS: string;
  CLICKUP_TARGET_BRANCH_FIELD_ID: string;
  CLICKUP_GITHUB_REVIEWER_FIELD_ID: string;
  CLICKUP_PROBLEM_STATEMENT_FIELD_ID: string;
  CLICKUP_EXPECTED_BEHAVIOR_FIELD_ID: string;
  CLICKUP_CURRENT_BEHAVIOR_FIELD_ID: string;
  CLICKUP_CONTEXT_OR_REPRO_STEPS_FIELD_ID: string;
  CLICKUP_RELEVANT_LINKS_FIELD_ID: string;
  CLICKUP_ACCEPTANCE_CRITERIA_FIELD_ID: string;
  CLICKUP_TEST_EXPECTATIONS_FIELD_ID: string;
  CLICKUP_TASK_TYPE_FIELD_ID?: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_WORKFLOW_REF: string;
  GITHUB_CHANGE_WORKFLOW_FILE: string;
  GH_PAT_TOKEN: string;
  WEBHOOK_DEDUPE_TTL_SECONDS?: string;
  WEBHOOK_DEDUPE: KVNamespaceLike;
};

export type ClickUpCustomField = {
  id: string;
  name?: string;
  type?: string;
  value?: unknown;
  type_config?: {
    options?: Array<{
      id?: string;
      name?: string;
      orderindex?: number | string;
    }>;
  };
};

export type ClickUpTask = {
  id: string;
  name: string;
  url?: string;
  description?: string | null;
  status?: {
    status?: string | null;
  };
  custom_fields?: ClickUpCustomField[];
};

export type ClickUpWebhookPayload = {
  event?: string;
  task_id?: string;
  webhook_id?: string;
  history_items?: Array<{
    id?: string;
    field?: string;
    before?: {
      status?: string | null;
    };
    after?: {
      status?: string | null;
    };
  }>;
};

export type DispatchInput = {
  clickupTaskId: string;
  clickupTaskUrl: string;
  taskType: TaskType;
  githubRepository: string;
  targetBranch: string;
  prBaseBranch: string;
  githubReviewerUsername: string;
  problemStatement: string;
  expectedBehavior: string;
  currentBehavior: string;
  contextOrReproductionSteps: string;
  relevantLinksLogsOrScreenshots: string;
  acceptanceCriteria: string;
  testExpectations: string;
};

export type ValidationResult =
  | {
      ok: true;
      input: DispatchInput;
    }
  | {
      ok: false;
      missingFields: string[];
    };
