# OpenCode Zen free-model profiles — observed on one long session

Evidence log kept by the supervisor across ~8 hours driving five OpenCode
instances on the Cat Goric task (deep analysis + implementation on a small
physics/LLM-driver codebase). Intended as an update to the `consult-opencode`
skill.

**Scope limit that must survive into anything written from this.** One task
shape, one codebase, n-of-one per model except where noted. These are
observations, not benchmarks.

---

## opencode/big-pickle — the worker (build agent)
Community-identified GLM-4.6-class, 200K ctx. Ran every measurement and wrote
every commit.

**Best judgement on the team, by a clear margin.**
- Volunteered a six-point falsifiable prediction set before measuring, unasked,
  including a self-falsifier the supervisor had missed.
- Caught **four** supervisor errors: a "preserved baseline" that was a mid-flight
  copy; an inference stated as a measurement; a wrong premise about which laser
  test `arc.cjs` models; and a 26-frame discrepancy traced to its own error.
- Archived a baseline before launching a run, on its own initiative, when the
  supervisor had not thought to.
- Found the session's biggest defect (unseeded per-frame laser thickness) while
  doing something else, and the `VIDEO`/viewport confound after that.
- Disposed of the supervisor's own change better than the supervisor argued for:
  "right by accident, then dead code — delete it, because a tolerance that
  narrow advertises precision the model does not have."

**Weaknesses.**
- Mis-bucketed its own decisive measurement once (attributed one bucket's
  objectives to another).
- An arithmetic error with a wrong denominator that *reversed* its own
  conclusion; it looked careful and was not.
- Quoted a decision count that reconciled with nothing on disk.

**Operational cost — the worst stability on the team.** Wedged ~6 times: pane
reads `working`, spinner empty, steering message stuck at `QUEUED`, nothing
running. Needs **double-Escape** then a short nudge. Also spawns a new wrapper
script per instruction until told to consolidate, and once killed an in-flight
run to start another.

## opencode/nemotron-3-ultra-free — observer (plan agent)
NVIDIA 550B. Replaced longcat mid-session.

- **Fast and precise.** 45s for an exact function signature, per-parameter
  meaning, three independent lines of evidence, all verified correct.
- Accepts correction well and produces a *better* design after being attacked
  (the dual-model reachability answer came out of a cross-check).
- **Characteristic failure: reasons from a clean abstraction past the messy
  truth.** Rebutted a cache-key finding by arguing the graph is "time-invariant
  geometric connectivity" — true of that abstraction, false of the graph as
  implemented, because its edges are lethality-filtered. Measurement overturned
  it and it conceded cleanly.
- Answers exactly what is asked and does not reach further. Needed prompting to
  draw the two larger consequences of its own finding.
- Asserted a measurement class for four levels on evidence from one.

## opencode/space-bunny-free — walls (plan agent)
Zero-retention per OpenCode docs.

**The best analyst, and the best epistemics on the team.**
- Reports its own bugs unprompted: shipped a report naming three probe bugs it
  had found in its own scan and the false blocker each had manufactured.
- Keeps a **"discarded verdicts, on the record"** section; four of five entries
  were its own prior claims, including one the supervisor had already repeated
  upward.
- **Six clean self-retractions** in one session, each making the picture more
  accurate.
- Refused an instruction correctly: *"I will not scale your table — agreement
  between two instances of the same mistake is not corroboration."*
- Corrected the supervisor's inference that census flips imply route risk.
- Separates confidence levels explicitly ("high on topology, medium on the
  numbers") without being asked.

**Weaknesses.** Drifted into Chinese mid-report once, requiring a restatement.
Discarded a correct hypothesis (half-thickness) that later proved right.

## opencode/mimo-v2.6-flash-free — tail levels (plan agent)
- Produced the most *actionable* triage: a ranked three-level analysis with a
  **falsifiable flip condition** stated for its own ranking.
- Extended a finding further than the supervisor had (propagating laser
  thickness into every timing gate).
- **Context-hungry.** Hit its limit twice, self-compacted once, and at ~79%
  began misremembering its own earlier output — doubting a number it had in
  fact written. Extract its work before that point.

## opencode/ling-3.0-flash-fin-free — airborne (plan agent)
- Competent cross-check; correctly recommended downgrading a verdict from
  "driver defect" to "unconfirmed, could be model defect".
- **Reported a disagreement that did not exist** (`landingsFrom` returning empty
  when it does not), which the supervisor amplified before verifying. Cost a
  task cycle.
- Got stuck on a **JavaScript syntax error** (`for (const k, v of …)`) and burned
  a cycle without self-correcting.

## opencode/longcat-2.5-preview-free — RETIRED
- Adequate first answer, then chronic thrashing: narrated "let me be efficient"
  repeatedly without acting; adopted a wrong premise and circled it instead of
  running the diff that would settle it.
- **Degenerated into a hard loop at ~88K ctx**, printing the same intent a dozen
  times while stating "I realize I'm stuck in a loop". Unrecoverable.

## opencode/nemotron-3.5-lightning-free — RETIRED
- **Hallucinated hard.** Mid-analysis, emitted a Baton Rouge community-centre
  basketball listing, then claimed the supplied document did not match. 18
  minutes, nothing usable.
- Before collapsing it had reached a *wrong* conclusion (that the snap lacks
  horizontal velocity) that would have blocked a design had it been trusted.

---

## Practical conclusions

1. **Pair a strong analyst with a separate implementer.** The two best results
   of the session both came from one instance attacking another's spec.
2. **Cross-checking found defects that would have shipped**, including a
   four-action grid that was invisible on the test level and lost 40% of edges
   on the target level.
3. **Different lineages matter.** Agreement between instances sharing an
   inherited error is not corroboration — space-bunny's point, and the single
   most useful methodological remark anyone made.
4. **Extract durable artifacts early.** Two instances were lost mid-session with
   unbanked work; everything since is written to files at capture time with
   provenance and caveats attached.
5. **Budget for wedging.** The most capable worker was also the least stable.
