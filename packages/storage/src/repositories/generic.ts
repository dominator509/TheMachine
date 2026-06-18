import type { DbConnection } from "../db/connection.js";

/** Base entity fields for persistence. */
export interface StoredEntity {
  id: string;
  created_at: string;
  updated_at: string;
}

/** Generic repository with CRUD operations. */
export interface Repository<T extends StoredEntity> {
  findById(id: string): T | undefined;
  findAll(): T[];
  insert(entity: T): void;
  update(entity: Partial<T> & { id: string }): void;
  delete(id: string): boolean;
}

/** Creates a generic repository backed by a table. */
export function createRepository<T extends StoredEntity>(
  conn: DbConnection,
  table: string,
  columns: string[],
): Repository<T> {
  const colList = columns.join(", ");
  const placeholders = columns.map(() => "?").join(", ");
  const nonKeyColumns = columns.filter((c) => c !== "id" && c !== "created_at");

  const selectStmt = conn.db.prepare(`SELECT * FROM ${table} WHERE id = ?`);
  const selectAllStmt = conn.db.prepare(`SELECT * FROM ${table}`);
  const insertStmt = conn.db.prepare(`INSERT INTO ${table} (${colList}) VALUES (${placeholders})`);
  const deleteStmt = conn.db.prepare(`DELETE FROM ${table} WHERE id = ?`);

  return {
    findById(id: string): T | undefined {
      return selectStmt.get(id) as T | undefined;
    },

    findAll(): T[] {
      return selectAllStmt.all() as T[];
    },

    insert(entity: T): void {
      const values = columns.map((c) => (entity as Record<string, unknown>)[c]);
      insertStmt.run(...values);
    },

    update(entity: Partial<T> & { id: string }): void {
      // Only update columns that are provided in the entity
      const setClauses: string[] = [];
      const values: unknown[] = [];
      for (const col of nonKeyColumns) {
        if (col in entity) {
          setClauses.push(`${col} = ?`);
          values.push((entity as Record<string, unknown>)[col]);
        }
      }
      if (setClauses.length === 0) return;
      values.push(entity.id);
      const stmt = conn.db.prepare(`UPDATE ${table} SET ${setClauses.join(", ")} WHERE id = ?`);
      stmt.run(...values);
    },

    delete(id: string): boolean {
      const result = deleteStmt.run(id);
      return result.changes > 0;
    },
  };
}
