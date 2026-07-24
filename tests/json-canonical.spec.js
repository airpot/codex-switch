"use strict";

const assert = require("node:assert/strict");
const {
  canonicalizeJsonBody,
  shortJsonHash,
} = require("../dist/runtime/json-canonical.js");

module.exports = {
  name: "canonical JSON",
  tests: [
    {
      name: "sorts nested object keys while preserving array order",
      run() {
        const left = Buffer.from(JSON.stringify({
          tools: [{ parameters: { properties: { z: { type: "string" }, a: { type: "number" } }, type: "object" }, name: "lookup" }],
          model: "gpt-5.6-sol",
        }));
        const right = Buffer.from(JSON.stringify({
          model: "gpt-5.6-sol",
          tools: [{ name: "lookup", parameters: { type: "object", properties: { a: { type: "number" }, z: { type: "string" } } } }],
        }));
        const canonicalLeft = canonicalizeJsonBody(left, "application/json");
        const canonicalRight = canonicalizeJsonBody(right, "application/json");
        assert.deepEqual(canonicalLeft, canonicalRight);
        assert.equal(canonicalLeft.toString(), '{"model":"gpt-5.6-sol","tools":[{"name":"lookup","parameters":{"properties":{"a":{"type":"number"},"z":{"type":"string"}},"type":"object"}}]}');
      },
    },
    {
      name: "uses the same subtree hash for equivalent object key orders",
      run() {
        assert.equal(shortJsonHash({ b: 2, a: { d: 4, c: 3 } }), shortJsonHash({ a: { c: 3, d: 4 }, b: 2 }));
        assert.notEqual(shortJsonHash(["first", "second"]), shortJsonHash(["second", "first"]));
      },
    },
  ],
};
