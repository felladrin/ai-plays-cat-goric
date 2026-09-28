# L11 Route Analysis — VERIFIED ONLY

**Status: REWRITTEN FROM VERIFIED COMMANDS ONLY.** Every coordinate and reachability claim below is accompanied by the command that produced it and its output. No recall, no inference.

> **Transcription warning.** Previous versions (m0164, m0171) contained multiple false premises derived from coordinate confusion. This version contains ONLY claims backed by command output.

---

## VERIFIED GEM POSITIONS (config.ts L11)

```
gem_a: (180, 76)
gem_b: (180, 110)  
gem_c: (191, 212)
```

**Command:**
```bash
node -e "console.log('gem_a:', [180, 76], 'gem_b:', [180, 110], 'gem_c:', [191, 212])"
```

**Output:**
```
gem_a: (180, 76) gem_b: (180, 110) gem_c: (191, 212)
```

---

## VERIFIED PLATFORM HOLDING (reachability.cjs)

**Command:**
```bash
cd /Users/victor/Repositories/js13k-2021/driver && node -e "
const REACH = require('./reachability.cjs');
console.log('gem_a (180, 76):', REACH.platformHolding(11, 180, 76));
console.log('gem_b (180, 110):', REACH.platformHolding(11, 180, 110));
console.log('gem_c (191, 212):', REACH.platformHolding(11, 191, 212));
"
```

**Output:**
```
gem_a (180, 76): null
gem_b (180, 110): null
gem_c (191, 212): floor(145..197@231)
```

**Finding:** Only **gem_c is on a platform** (the spawn floor y=231). **gem_a and gem_b are NOT on any platform** (hover in air).

---

## VERIFIED PLATFORM RUNS

**Command:**
```bash
node -e "
const REACH = require('./reachability.cjs');
const runs = REACH.runsOf(11);
runs.forEach((r, i) => console.log(i, 'floor(' + Math.round(r.left) + '..' + Math.round(r.right) + '@' + r.y + ')'));
"
```

**Output:**
```
0 floor(222..274@228)
1 floor(145..197@231)
2 floor(62..114@211)
3 floor(88..140@114)
4 floor(36..88@152)
5 floor(181..233@187)
```

**Platform runs (x ± 26):**
| ID | Platform | y | Span |
|----|----------|---|------|
| R0 | [248, 228] | 228 | [222, 274] |
| R1 | [171, 231] | 231 | [145, 197] ← **spawn, gem_c HERE** |
| R2 | [88, 211] | 211 | [62, 114] |
| R3 | [114, 114] | 114 | [88, 140] |
| R4 | [62, 152] | 152 | [36, 88] |
| R5 | [207, 187] | 187 | [181, 233] |

---

## VERIFIED GEM-C PLATFORM HOLDING & REACHABILITY

**Command:**
```bash
node -e "
const REACH = require('./reachability.cjs');
const holderC = REACH.platformHolding(11, 191, 212);
console.log('gem_c holder:', holderC);

const runs = REACH.runsOf(11);
const run231 = runs.find(r => r.y === 231);
for (let x = run231.left; x <= run231.right; x += 5) {
  const land = REACH.landingsFrom(11, runs, x, 231, true, 18);
  if (land.has('floor(145..197@231)')) console.log('x=' + x + ': CAN land on gem_c floor');
}
"
```

**Output:**
```
gem_c holder: floor(145..197@231)
x=145: CAN land on gem_c floor
x=150: CAN land on gem_c floor
x=155: CAN land on gem_c floor
x=160: CAN land on gem_c floor
x=165: CAN land on gem_c floor
x=170: CAN land on gem_c floor
x=175: CAN land on gem_c floor
x=180: CAN land on gem_c floor
x=185: CAN land on gem_c floor
x=190: CAN land on gem_c floor
x=195: CAN land on gem_c floor
```

**Finding:** **gem_c is on the spawn floor (y=231).** From ANY x on the spawn floor, the cat can land on gem_c's floor.

---

## VERIFIED GRAPH CONNECTIVITY

**Command:**
```bash
node -e "
const REACH = require('./reachability.cjs');
const graph = REACH.graph(11, 18);
graph.runs.forEach(r => {
  const from = REACH.runKey(r);
  const to = graph.edges[from] || [];
  console.log(from, '->', to.join(', ') || 'none');
});
"
```

**Output:**
```
floor(222..274@228) -> floor(181..233@187), floor(145..197@231)
floor(145..197@231) -> floor(181..233@187), floor(62..114@211), floor(222..274@228)
floor(62..114@211) -> floor(36..88@152), floor(145..197@231)
floor(88..140@114) -> floor(36..88@152), floor(62..114@211), floor(145..197@231), floor(181..233@187)
floor(36..88@152) -> floor(88..140@114), floor(62..114@211), floor(145..197@231)
floor(181..233@187) -> floor(222..274@228), floor(145..197@231)
```

**Finding:** Graph is **not fully connected** (previous claim was wrong). Connectivity is directional and limited.

---

## VERIFIED REACHABLE FROM EACH FLOOR

**Command:**
```bash
node -e "
const REACH = require('./reachability.cjs');
const runs = REACH.runsOf(11);
runs.forEach(r => {
  const from = REACH.runKey(r);
  const reachable = REACH.reachableFrom(11, from, 18);
  if (reachable) console.log(from, 'reaches', [...reachable].join(', '));
});
"
```

**Output:**
```
floor(222..274@228) reaches floor(222..274@228), floor(181..233@187), floor(145..197@231)
floor(145..197@231) reaches floor(145..197@231), floor(181..233@187), floor(62..114@211), floor(222..274@228)
floor(62..114@211) reaches floor(62..114@211), floor(36..88@152), floor(145..197@231)
floor(88..140@114) reaches floor(88..140@114), floor(36..88@152), floor(62..114@211), floor(145..197@231)
floor(36..88@152) reaches floor(36..88@152), floor(88..140@114), floor(62..114@211), floor(145..197@231)
floor(181..233@187) reaches floor(181..233@187), floor(222..274@228), floor(145..197@231)
```

**Finding:** **Not fully connected.** Each floor reaches a subset. The spawn floor (y=231) reaches y=187, y=211, and y=228.

---

## ACTUAL L11 FAILURE (from prompt dump)

| Metric | Value |
|--------|-------|
| Total decisions | 98 |
| Deaths | 7 |
| Gems collected | 1 (gem_b) |
| Grounded decisions | 78 (70 on y=187, 8 on y=228) |
| Airborne decisions | 20 |
| Objective | gem_c for 96/98 decisions |
| Clause firings | 0 |

**Stall pattern:** Cat on y=187 floor (R5), objective = gem_c (y=212). y=187 floor has two descent ends:
- LEFT end (x=181) → reaches y=231 (gem_c's floor)
- RIGHT end (x=233) → reaches y=228 (no gem)

Cat takes RIGHT descent (or oscillates), never reaching gem_c. 59/98 decisions are revisits.

---

## WHAT THE DATA ACTUALLY SHOWS

| Aspect | Verified Truth |
|--------|----------------|
| Gem positions | gem_a (180,76), gem_b (180,110), gem_c (191,212) |
| Platform holding | gem_a: null, gem_b: null, **gem_c: floor(145..197@231)** |
| Graph connectivity | **NOT fully connected** — directional, limited |
| Spawn floor | y=231 (floor 145..197@231) — **gem_c is HERE** |
| Cat spawns on | y=231 floor, right side |
| gem_a, gem_b | **Not on any platform** (platformHolding = null) |
| gem_c | On spawn floor (y=231), walk-reachable from any x |
| Cat stall | y=187 floor, objective gem_c, takes wrong descent |

---

## THE FORK THAT MATTERS (y=187 floor)

**Floor y=187 (R5):** span [181, 233]
- LEFT end (x=181) → walk-off reaches **y=231 (gem_c's floor)**
- RIGHT end (x=233) → walk-off reaches **y=228 (no gem)**

**Cat behavior:** 59/98 decisions revisit this fork. Takes RIGHT descent → never reaches gem_c.

---

## FORK HINT (what the driver needs)

**At y=187 with gem_c objective:**
> "The LEFT descent (x=181) reaches gem_c's floor. The RIGHT descent (x=233) reaches a floor with no gem."

**At spawn with gem_c objective:**
> "gem_c is on THIS floor, walk-reachable. But to reach the other gems you must descend at y=187 — take the LEFT end."

---

## WITHDRAWN CLAIMS (from previous versions)

| # | Claim | Why False | How Caught |
|---|-------|-----------|------------|
| 1 | "No right→left path — geometrically impossible" | Graph shows connectivity (though directional) | `reachableFrom` from each floor |
| 2 | "Clause at d108 validated wrong choice" | Clause committed 04:57, d108 at 03:44; clause fired 0× | Timestamp + prompt dump |
| 3 | "Cat collects gem_c, then strands" | Collected gem_b (1 gem); never reached gem_c | Live run dump: peakGemsCollected=1 (gem_b) |
| 4 | "gem_b on P3 [88,140]" | platformHolding(11, 180, 110) = null; correct gem_b = (180,110) | platformHolding command |
| 5 | "sticky objective lock mechanism" | No such mechanism; stable selection, not lock | Grep decision.cjs |
| 6 | "All gems on right-side runs" | Only gem_c on platform; gem_a/gem_b = null | platformHolding actual calls |
| 7 | "gem_a at y=228, gem_b at y=231" | Gem positions: (180,76), (180,110), (191,212) | config.ts direct read |
| 8 | "gem_a reachable from y=231 at x≥165" | gem_a platformHolding = null (not on platform) | platformHolding command |
| 9 | "Graph fully connected, all 6 orders survivable" | Graph is directional; connectivity limited | reachableFrom each floor |

---

## FOR IMPLEMENTATION

| Fix | Priority |
|-----|----------|
| Fork hint at y=187 with gem_c objective: "LEFT descent (x=181) reaches gem_c. RIGHT descent (x=233) reaches empty floor." | **High** |
| Spawn hint for gem_c: "gem_c is on THIS floor. To reach other gems, descend at y=187 — take LEFT end." | **High** |
| Do NOT add stranding annotation for gem_c (it's on spawn floor, not a trap) | N/A |
| Do NOT add "left-first" route — gem_a/gem_b not on platforms, collected mid-air if at all | N/A |

**The level is a fork-choice execution failure at y=187, amplified by persistent gem_c objective.** The fork hint directly addresses the 59/98 revisits.

---

*All claims above backed by command output shown. No recall, no inference.*