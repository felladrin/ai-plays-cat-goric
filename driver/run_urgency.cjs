"use strict";
// run_urgency.cjs — launcher that swaps decision.cjs for the urgency-patched
// copy in the require cache, then runs run_level.cjs unchanged. Lets the patch
// be tested without touching the real decision.cjs.
//
// Usage: node run_urgency.cjs halogen 12
const decisionPath = require.resolve("./decision.cjs");
const patched = require("./decision.patched_urgency.cjs");
require.cache[decisionPath] = {
  id: decisionPath,
  filename: decisionPath,
  loaded: true,
  exports: patched,
  children: [],
  paths: [],
};
require("./run_level.cjs");
