// Shared stall detector window. Must exceed 2 * (VISIT_STUCK_THRESHOLD + 1)
// so the revisit escalation can fire before the diagnostic abort.
// VISIT_STUCK_THRESHOLD = 3 (decision.cjs), so minimum is 9. Using 24.
module.exports = {
  STALL_WINDOW: 24,
  STALL_MAX_DISTINCT: 2,
};