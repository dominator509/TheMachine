// Diagnostic export schemas.

export interface DiagnosticRequest {
  readonly includeExtra?: boolean;
  readonly extraData?: Record<string, unknown>;
}

export interface DiagnosticSection {
  readonly label: string;
  readonly data: Record<string, unknown>;
  readonly redacted: boolean;
}

export interface DiagnosticResponse {
  readonly generatedAt: string;
  readonly platform: string;
  readonly version: string;
  readonly uptimeMs: number;
  readonly nodeVersion: string;
  readonly platformArch: string;
  readonly osInfo: string;
  readonly redactionApplied: boolean;
  readonly sections: DiagnosticSection[];
}
