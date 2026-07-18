// Shared UI component registry for desktop/CLI surfaces.

export interface UIComponentDefinition {
  readonly id: string;
  readonly label: string;
  readonly surface: "desktop" | "cli" | "shared";
}

export interface UIReleaseDecision {
  readonly status: "accepted" | "pending" | "rejected";
  readonly detail: string;
}

export interface UIRegistry {
  readonly components: readonly UIComponentDefinition[];
  readonly releaseDecision: UIReleaseDecision;
  listComponents(): readonly UIComponentDefinition[];
  getComponent(id: string): UIComponentDefinition | null;
  isReleaseReady(): boolean;
}

const COMPONENTS: readonly UIComponentDefinition[] = [
  { id: "plan-status", label: "Plan Status", surface: "shared" },
  { id: "settings", label: "Settings", surface: "desktop" },
  { id: "readiness", label: "Readiness", surface: "shared" },
];

export function createUI(releaseDecision?: UIReleaseDecision): UIRegistry {
  const decision = releaseDecision ?? {
    status: "pending",
    detail: "Shared UI registry exists; complete component surface has not been accepted.",
  };
  return {
    components: COMPONENTS,
    releaseDecision: decision,
    listComponents: () => COMPONENTS,
    getComponent: (id: string) => COMPONENTS.find((component) => component.id === id) ?? null,
    isReleaseReady: () => decision.status === "accepted" && COMPONENTS.length > 0,
  };
}
