# Rules

These are the constraints the project is judged by. A run that beats the game by breaking one of them is worth nothing.

## 1. The classifier makes every decision

The harness may only render state to text, list the legal actions, and apply the returned choice. No pathfinder, no heuristic fallback, no retry until the model picks what you wanted, no scripted moves.

A failed model call pauses the run. It must never fall through to a default action. `jev.cjs` raises `JevHardError` for this reason.

If the model plays badly, fix the state wording, not the decision maker.

## 2. The objective menu stays flat

The menu is a flat, simultaneously present set of observable positions that the model picks from on every decision. The line is crossed the moment the driver:

- auto-switches the objective once the cat reaches one, or
- orders the objectives into a sequence, or
- lets reaching one objective change what the next menu offers.

A change in the menu is allowed only when the observable geometry changed (a gem was collected, the cat left the floor), never because the driver advanced a script.

The distinction: a goal pursued greedily can produce the plan, and a plan handed over is something else. Giving the model an observable position to pursue, where the multi-step route emerges one decision at a time, is the model driving.

## 3. Descent and ascent waypoints are offered, and this must be disclosed

When a remaining objective sits below the floor the cat stands on, the two ends of that floor are added to the menu as selectable descent points (`descent_left`, `descent_right`), labeled truthfully as descent routes with what they land on. `ascentPoints` is the mirror for an objective above, retargeted at the destination platform rather than at a launch spot on the cat's own floor.

This is a real widening of what the model is handed. Any public write-up has to say so. Do not present a result as though the model found the descent unaided.

It stays inside rule 2 because the waypoints are observable geometry, the trigger (an objective below or above the current floor) is observable geometry rather than a plan, the menu stays flat and simultaneous, and nothing is sequenced. Both functions are generated from the general rule and key off floor geometry, so the same code path produces them on any level with the same shape. Reachability comes from the validated simulator, so it is physics rather than a hand-written route.

## 4. Stop adding state facts

Five state facts were added in one early session and every one needed gating afterwards. A true statement can make the model worse purely by appearing where it does not bear on the decision. Three separate instances of this are recorded in [dead-ends.md](dead-ends.md), and every one was caught by a regression on a level that already worked, never by anything failing outright.

More facts is not the productive direction. Before adding one, read the implied-relevance section and the arm D result in [dead-ends.md](dead-ends.md).

## 5. Name the endpoint on every result

Results from different endpoints are not comparable, and neither are isolated runs and ladder runs of the same level. See [results.md](results.md) and [method.md](method.md).
