export interface CommandEntry {
  readonly name: string;
  readonly description: string;
  /**
   * Preferred execution contract. The executable is launched directly with
   * shell:false and each argument remains a distinct argv entry.
   */
  readonly executable?: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly timeoutMs?: number;
  readonly environment?: Readonly<Record<string, string>>;
  readonly passEnvironment?: readonly string[];
  /**
   * Backward-compatible command syntax for existing callers. It is tokenized
   * without a shell and rejects pipes, redirects, command substitution, and
   * shell executables. New code should use executable + args.
   */
  readonly script?: string;
}

export interface CommandResult {
  readonly command: string;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface CommandExecutionOptions {
  readonly cwd?: string;
  readonly timeoutMs?: number;
  readonly environment?: Readonly<Record<string, string>>;
  readonly passEnvironment?: readonly string[];
  readonly signal?: AbortSignal;
  readonly maxOutputBytes?: number;
}

export interface CommandRegistry {
  register(cmd: CommandEntry): void;
  isAllowed(name: string): boolean;
  get(name: string): CommandEntry | null;
  list(): CommandEntry[];
  execute(
    name: string,
    args?: readonly string[],
    options?: CommandExecutionOptions,
  ): Promise<CommandResult>;
}
