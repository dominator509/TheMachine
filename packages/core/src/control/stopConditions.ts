// STOP condition detection — pure functions implementing AGENTS.md §4.

/** Classification of a STOP condition. */
export interface StopCondition {
  readonly rule: string;
  readonly triggered: boolean;
  readonly evidence: string;
  readonly blocker: string;
  readonly recommendedDefault: string;
}

/** Result of evaluating all STOP conditions. */
export interface StopEvaluation {
  readonly shouldStop: boolean;
  readonly conditions: StopCondition[];
  readonly blockers: string[];
}

/** Input needed to evaluate STOP conditions. */
export interface ExecutionContext {
  readonly requiresSecret: boolean;
  readonly secretAvailable: boolean;
  readonly mayDestroyData: boolean;
  readonly commandDefined: boolean;
  readonly specAvailable: boolean;
  readonly testFrameworkAvailable: boolean;
  readonly repoClean: boolean;
  readonly hasThirdPartyApi: boolean;
  readonly apiVerifiable: boolean;
}

/**
 * Evaluates all STOP conditions against the current execution context.
 * Implements AGENTS.md §4.
 */
export function evaluateStopConditions(ctx: ExecutionContext): StopEvaluation {
  const conditions: StopCondition[] = [];

  // 1. Missing required secret
  conditions.push({
    rule: "Missing required secret",
    triggered: ctx.requiresSecret && !ctx.secretAvailable,
    evidence:
      ctx.requiresSecret && !ctx.secretAvailable
        ? "Secret required but not available"
        : "No secret required or secret available",
    blocker: "Provide the required credential",
    recommendedDefault: "Obtain and configure the missing secret",
  });

  // 2. Destructive action
  conditions.push({
    rule: "Destructive action without permission",
    triggered: ctx.mayDestroyData,
    evidence: ctx.mayDestroyData
      ? "Action may destroy/overwrite/migrate/expose user data"
      : "No destructive action detected",
    blocker: "User permission required before destructive operations",
    recommendedDefault: "Ask for explicit permission before proceeding",
  });

  // 3. Missing command from COMMANDS.md
  conditions.push({
    rule: "Missing command from COMMANDS.md",
    triggered: !ctx.commandDefined,
    evidence: !ctx.commandDefined
      ? "Required command not found in COMMANDS.md"
      : "Command is documented",
    blocker: "Update COMMANDS.md before using a new command",
    recommendedDefault: "Add the command to COMMANDS.md with repository evidence",
  });

  // 4. Repository contradiction with ExecPlan
  conditions.push({
    rule: "Repository contradicts ExecPlan",
    triggered: !ctx.specAvailable,
    evidence: !ctx.specAvailable ? "Spec files not available for verification" : "Specs available",
    blocker: "Cannot verify implementation matches spec",
    recommendedDefault: "Read repository files to confirm current state",
  });

  // 5. Tests cannot run
  conditions.push({
    rule: "Tests cannot run",
    triggered: !ctx.testFrameworkAvailable,
    evidence: !ctx.testFrameworkAvailable
      ? "Test framework not available"
      : "Test framework available",
    blocker: "Install or configure the test framework",
    recommendedDefault: "Follow recovery instructions in AGENTS.md or COMMANDS.md",
  });

  // 6. Third-party API cannot be verified
  conditions.push({
    rule: "Third-party API cannot be verified",
    triggered: ctx.hasThirdPartyApi && !ctx.apiVerifiable,
    evidence:
      ctx.hasThirdPartyApi && !ctx.apiVerifiable
        ? "Third-party API used but cannot be verified locally"
        : "No unverifiable third-party API dependency",
    blocker: "Verify the API documentation or implementation locally",
    recommendedDefault: "Use documented APIs only; check installed packages",
  });

  // 7. Repository has unrelated changes
  conditions.push({
    rule: "Repository has unrelated changes",
    triggered: !ctx.repoClean,
    evidence: !ctx.repoClean
      ? "Repository has uncommitted changes outside scope"
      : "Repository is clean",
    blocker: "Commit or stash unrelated changes before proceeding",
    recommendedDefault: "Stash unrelated changes with git stash",
  });

  const triggered = conditions.filter((c) => c.triggered);
  const blockers = triggered.map((c) => c.blocker);

  return {
    shouldStop: triggered.length > 0,
    conditions,
    blockers,
  };
}
