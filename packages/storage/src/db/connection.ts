import Database from "better-sqlite3";

/** Options for opening a database connection. */
export interface ConnectionOptions {
  readonly path: string;
  readonly readonly?: boolean;
}

/** Wraps a better-sqlite3 connection with helper accessors. */
export interface DbConnection {
  readonly db: Database.Database;
  readonly path: string;
  readonly readonly: boolean;
}

/** Creates and returns a database connection. */
export function createConnection(opts: ConnectionOptions): DbConnection {
  const db = new Database(opts.path, {
    readonly: opts.readonly ?? false,
  });
  if (!opts.readonly) {
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
  }
  return { db, path: opts.path, readonly: opts.readonly ?? false };
}

/** Closes the database connection. */
export function closeConnection(conn: DbConnection): void {
  conn.db.close();
}

/** Creates an in-memory database for testing. */
export function createInMemoryConnection(): DbConnection {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return { db, path: ":memory:", readonly: false };
}
