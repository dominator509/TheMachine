// Command registry types and allowlist.

/** A registered allowed command. */
export interface CommandEntry {
  readonly name: string;
  readonly script: string;
  readonly description: string;
}

/** Result of executing a command. */
export interface CommandResult {
  readonly command: string;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Command registry — allowlist-based. */
export interface CommandRegistry {
  register(cmd: CommandEntry): void;
  isAllowed(name: string): boolean;
  get(name: string): CommandEntry | null;
  list(): CommandEntry[];
  execute(name: string, args?: string[]): Promise<CommandResult>;
}
