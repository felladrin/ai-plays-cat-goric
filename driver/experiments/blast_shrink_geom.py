#!/usr/bin/env python3
"""SHRINK_GEOM blast: compare render_states.cjs outputs.

  python3 experiments/blast_shrink_geom.py ref.jsonl cand.jsonl

ref = main's driver directory, cand = this branch with the gate unset (must give
0 diffs) or with SHRINK_GEOM=1 (counts per level). Rows are joined on
(archive, level, index), not line order, because an archive still being written
shifts every later row. The objective call is compared as an order-insensitive
set: its menu order comes from the seeded RNG, which advances once per rendered
state, so it depends on how many states the process rendered before this one.
"""
import json
import sys
from collections import Counter


def load(p):
    d = {}
    with open(p) as fh:
        for line in fh:
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            d[(row["f"], row["level"], row["i"])] = row
    return d


def objnorm(s):
    if s.startswith("ERR"):
        return s
    o = json.loads(s)
    crit = o.get("questions", {}).get("objective", {}).get("criteria", {})
    return json.dumps(crit, sort_keys=True), sorted(o.get("state", "").split("\n"))


a, b = load(sys.argv[1]), load(sys.argv[2])
keys = sorted(set(a) & set(b))
by_field, per, n = Counter(), Counter(), Counter()
for k in keys:
    n[k[1]] += 1
    diff = [f for f in ("move", "menu") if a[k][f] != b[k][f]]
    if objnorm(a[k]["obj"]) != objnorm(b[k]["obj"]):
        diff.append("obj")
    by_field.update(diff)
    if diff:
        per[k[1]] += 1
print("compared", len(keys), "diffs by field", dict(by_field))
for lv in sorted(n):
    print(f"  L{lv:2d} {n[lv]:6d} states, {per[lv]:5d} differ")
