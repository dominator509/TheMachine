export type ReleaseDecisionStatus = "accepted" | "pending" | "rejected";

export interface ReleaseDecision {
  readonly status: ReleaseDecisionStatus;
  readonly decidedBy?: string;
  readonly decidedAt?: string;
  readonly detail: string;
}

export function acceptedReleaseDecision(detail: string): ReleaseDecision {
  return {
    status: "accepted",
    detail,
  };
}
