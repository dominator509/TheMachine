import assert from "node:assert/strict";
import { add } from "./src/math.mjs";

assert.equal(add(2, 3), 5);
assert.equal(add(-4, 9), 5);
assert.equal(add(0, 0), 0);
console.log("addition: ok");
