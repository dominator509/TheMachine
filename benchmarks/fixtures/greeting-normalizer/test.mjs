import assert from "node:assert/strict";
import { normalizeGreeting } from "./src/greeting.mjs";

assert.equal(normalizeGreeting("  hello   machine  "), "Hello machine!");
assert.equal(normalizeGreeting("already done!!!"), "Already done!");
assert.equal(normalizeGreeting("mULTI\tspace"), "MULTI space!");
console.log("greeting: ok");
