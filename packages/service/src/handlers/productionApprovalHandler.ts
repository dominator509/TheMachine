import type {
  ProductionApproval,
  ProductionApprovalResponse,
} from "../contracts/productionApproval.js";
import { productionApprovalMissingItems } from "../contracts/productionApproval.js";
import type { ServiceStore } from "../persistence/store.js";

export interface ProductionApprovalHandler {
  get(): ProductionApprovalResponse;
  record(approval: ProductionApproval): ProductionApprovalResponse;
  clear(): ProductionApprovalResponse;
}

interface ApprovalRow {
  readonly approval_json: string;
}

function parsePersistedApproval(contents: string): ProductionApproval {
  const value = JSON.parse(contents) as unknown;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Persisted production approval is not a JSON object.");
  }
  const approval = value as Partial<ProductionApproval>;
  if (
    typeof approval.workspaceId !== "string" ||
    typeof approval.approvedBy !== "string" ||
    typeof approval.approvedAt !== "string" ||
    typeof approval.detail !== "string" ||
    approval.providerConfiguration === undefined ||
    approval.mcpConfiguration === undefined ||
    approval.pluginSandbox === undefined ||
    approval.sharedUIScope === undefined ||
    approval.releaseDeployment === undefined
  ) {
    throw new Error("Persisted production approval is missing required fields.");
  }
  return approval as ProductionApproval;
}

export function createProductionApprovalHandler(
  initialApproval: ProductionApproval | null = null,
  store?: ServiceStore,
): ProductionApprovalHandler {
  let inMemoryApproval = initialApproval;

  function load(): ProductionApproval | null {
    if (!store) return inMemoryApproval;
    const row = store.conn.db
      .prepare(
        "SELECT approval_json FROM production_approvals ORDER BY updated_at DESC, workspace_id ASC LIMIT 1",
      )
      .get() as ApprovalRow | undefined;
    return row ? parsePersistedApproval(row.approval_json) : null;
  }

  function persist(approval: ProductionApproval): void {
    if (!store) {
      inMemoryApproval = approval;
      return;
    }
    store.ensureWorkspace(approval.workspaceId, process.cwd());
    const transaction = store.conn.db.transaction(() => {
      // V1 is a local single-user control plane with one active release decision.
      // Removing earlier rows prevents a cleared/replaced approval from resurfacing.
      store.conn.db.prepare("DELETE FROM production_approvals").run();
      store.conn.db
        .prepare(
          `INSERT INTO production_approvals
            (workspace_id, approval_json, approved_by, approved_at, updated_at)
           VALUES (?, ?, ?, ?, datetime('now'))`,
        )
        .run(
          approval.workspaceId,
          JSON.stringify(approval),
          approval.approvedBy,
          approval.approvedAt,
        );
    });
    transaction();
  }

  function response(): ProductionApprovalResponse {
    const approval = load();
    const missing = productionApprovalMissingItems(approval);
    return {
      approval,
      accepted: missing.length === 0,
      missing,
    };
  }

  if (initialApproval && store) persist(initialApproval);

  return {
    get: response,
    record(nextApproval: ProductionApproval): ProductionApprovalResponse {
      persist(nextApproval);
      return response();
    },
    clear(): ProductionApprovalResponse {
      if (store) {
        store.conn.db.transaction(() => {
          store.conn.db.prepare("DELETE FROM production_approvals").run();
        })();
      } else {
        inMemoryApproval = null;
      }
      return response();
    },
  };
}
