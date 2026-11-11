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
