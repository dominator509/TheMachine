import { M001_INITIAL_SCHEMA } from "./M001_initial_schema.js";
import { M002_PRODUCTION_APPROVALS } from "./M002_production_approvals.js";
import type { Migration } from "../db/migrator.js";

/** All registered migrations in immutable application order. */
export const ALL_MIGRATIONS: Migration[] = [M001_INITIAL_SCHEMA, M002_PRODUCTION_APPROVALS];
