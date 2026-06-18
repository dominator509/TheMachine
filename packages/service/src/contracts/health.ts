// Health check schemas.

export interface HealthRequest {
  readonly detail?: boolean;
}

export interface HealthResponse {
  readonly status: "ok" | "degraded" | "down";
  readonly platform: string;
  readonly version: string;
  readonly uptimeMs: number;
  readonly checks: Record<string, boolean>;
}
