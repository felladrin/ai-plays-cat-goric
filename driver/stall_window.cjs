// run_level's stall window. Must exceed 2 * (VISIT_STUCK_THRESHOLD + 1)
// so the revisit escalation can fire before the diagnostic abort.
// VISIT_STUCK_THRESHOLD = 3 (decision.cjs), so minimum is 9. Using 24.
// run_full.cjs deliberately keeps its own measured local window (10): its
// stall detector is progress-based, not position-distinct. See
// docs/open-problems.md, "STALL_WINDOW differs between the two runners".
module.exports = {
  STALL_WINDOW: 24,
  STALL_MAX_DISTINCT: 2,
};