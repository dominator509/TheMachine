// Shared primitive types for The Machine domain.
// No infrastructure imports.

/** Unique identifier across the domain. */
export type EntityId = string & { readonly __brand: "EntityId" };

/** A named label for grouping or categorizing entities. */
export type Label = string & { readonly __brand: "Label" };

/** SemVer string. */
export type SemVer = string & { readonly __brand: "SemVer" };

/** Clock-agnostic timestamp (conceptual — stored as ISO or number in storage layer). */
export type Timestamp = number;

/** Generic status common to many entities. */
export type ActivityStatus = "pending" | "active" | "completed" | "failed" | "stopped";

/** Severity of a validation result or error. */
export type Severity = "info" | "warning" | "error" | "critical";

/** Source-of-truth priority levels. */
export type Priority = 1 | 2 | 3 | 4 | 5 | 6 | 7;
