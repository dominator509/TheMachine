import { M001_INITIAL_SCHEMA } from "./M001_initial_schema.js";
import type { Migration } from "../db/migrator.js";

/** All registered migrations in order. */
export const ALL_MIGRATIONS: Migration[] = [M001_INITIAL_SCHEMA];
