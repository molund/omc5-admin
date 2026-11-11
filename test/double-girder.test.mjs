import { test } from "node:test";
import assert from "node:assert/strict";
import { DOUBLE_GIRDER, isDoubleGirder } from "../src/lib/doubleGirder.js";
import { STAGES, stageToPost } from "../src/lib/stages.js";

test("the double girder spans are the site's list", () => {
  assert.deepEqual([...DOUBLE_GIRDER], [31, 43, 44, 45, 46, 47, 52, 53, 54]);
  assert.equal(isDoubleGirder(44), true);
  assert.equal(isDoubleGirder(50), false);
});

test("on a double girder span only the arrival is logged, whatever was picked or written; other spans are as before", () => {
  assert.equal(stageToPost("hung", "hung", "all the segments are hung", undefined, 44), STAGES[0]);
  assert.equal(stageToPost("hung", STAGES[0], "", undefined, 50), "hung");
  assert.equal(stageToPost(undefined, STAGES[0], "", "hung"), "hung");
});

test("spans 1, 12, 13, 30 and 50 (in-place casting) have no glued step: it can't be picked, and what would be glued there is gluing started", async () => {
  const { isNotObserved, observable } = await import("../src/lib/stages.js");
  assert.equal(isNotObserved(50, "glued"), true);
  assert.equal(isNotObserved(49, "glued"), false);
  for (const n of [1, 12, 13, 30]) assert.equal(isNotObserved(n, "glued"), true, `span ${n}`);
  assert.equal(stageToPost("glued", "arrived at span", "", undefined, 50), "gluing started");
  assert.equal(stageToPost("glued", "arrived at span", "", undefined, 49), "glued");
  assert.equal(stageToPost(undefined, "arrived at span", "Span 50 is fully glued.", undefined, 50), "gluing started");
  assert.equal(stageToPost("cables down", "arrived at span", "", undefined, 50), "cables down");
  assert.equal(observable(50, "post-tensioning started"), "post-tensioning started");
});
