"use strict";
// A choice question with one option has a forced answer, so the System One client
// answers it locally instead of sending it: decider-2b's server rejects a 1-option
// choice with 422 (it takes 2..255 options), which stopped a benchmark run.
const assert = require("assert");
const { makeClient } = require("../jev.cjs");

const sent = [];
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  sent.push(Object.keys(body.questions));
  const answers = {};
  for (const [q, spec] of Object.entries(body.questions)) {
    const names = Object.keys(spec.criteria);
    answers[q] = { choice: names[0], probabilities: Object.fromEntries(names.map((n, i) => [n, i ? 0 : 1])) };
  }
  return { status: 200, text: async () => JSON.stringify({ answers }) };
};

const client = makeClient({ baseUrl: "http://test", path: "/v1/systemone", minIntervalMs: 0 });
const one = { type: "choice", instructions: "i", criteria: { right: "walk right" } };
const two = { type: "choice", instructions: "i", criteria: { left: "walk left", right: "walk right" } };

(async () => {
  let a = await client.classify("s", { move: one });
  assert.deepStrictEqual(a, { move: { choice: "right", probabilities: { right: 1 } } });
  assert.strictEqual(sent.length, 0, "a lone 1-option question is not sent");

  a = await client.classify("s", { objective: two, move: one });
  assert.deepStrictEqual(sent, [["objective"]], "only the multi-option question is sent");
  assert.deepStrictEqual(a.move, { choice: "right", probabilities: { right: 1 } });
  assert.strictEqual(a.objective.choice, "left");

  a = await client.classify("s", { move: two });
  assert.deepStrictEqual(sent[1], ["move"], "a normal question is sent unchanged");
  console.log("test_single_option: forced 1-option answers stay local, the rest are sent. Failed: 0");
})().catch((e) => { console.error(e); process.exit(1); });
