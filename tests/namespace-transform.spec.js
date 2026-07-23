"use strict";

const assert = require("node:assert/strict");
const {
  createNamespaceSseState,
  flattenNamespaceToolName,
  restoreNamespacedResponse,
  restoreNamespacedSseChunk,
  transformNamespacedRequest,
} = require("../dist/runtime/namespace-transform.js");

module.exports = {
  name: "Responses namespace compatibility",
  tests: [
    {
      name: "flattens namespace tools and rewrites historical input calls",
      run() {
        const body = Buffer.from(JSON.stringify({
          model: "client",
          tools: [
            { type: "function", name: "plain", parameters: {} },
            {
              type: "namespace",
              name: "mcp__files__",
              tools: [
                { type: "function", name: "read", parameters: {} },
                { type: "function", name: "write", parameters: {} },
              ],
            },
          ],
          input: [
            { type: "function_call", name: "read", namespace: "mcp__files__", call_id: "c1", arguments: "{}" },
            { type: "custom_tool_call", name: "exec", namespace: "exec", call_id: "c2", input: "x" },
          ],
          tool_choice: { type: "namespace", name: "mcp__files__" },
        }), "utf8");

        const transformed = transformNamespacedRequest(body, "application/json");
        const payload = JSON.parse(transformed.body.toString("utf8"));
        const flatRead = flattenNamespaceToolName("mcp__files__", "read");

        assert.deepEqual(payload.tools.map((tool) => tool.name), ["plain", flatRead, "mcp__files____write"]);
        assert.equal(payload.tools.some((tool) => tool.type === "namespace"), false);
        assert.equal(payload.input[0].name, flatRead);
        assert.equal("namespace" in payload.input[0], false);
        assert.equal("namespace" in payload.input[1], false);
        assert.equal(payload.tool_choice, "auto");
        assert.deepEqual(transformed.restoreMap.get(flatRead), { namespace: "mcp__files__", name: "read" });

        const standaloneChoice = transformNamespacedRequest(
          Buffer.from(JSON.stringify({ tool_choice: { type: "namespace", name: "mcp__files__" } }), "utf8"),
          "application/json"
        );
        assert.equal(JSON.parse(standaloneChoice.body.toString("utf8")).tool_choice, "auto");
      },
    },
    {
      name: "restores buffered and split SSE function calls",
      run() {
        const flatName = flattenNamespaceToolName("mcp__files__", "read");
        const restoreMap = new Map([[flatName, { namespace: "mcp__files__", name: "read" }]]);
        const response = Buffer.from(JSON.stringify({ output: [{ type: "function_call", name: flatName, call_id: "c1" }] }), "utf8");
        const restored = JSON.parse(restoreNamespacedResponse(response, restoreMap).toString("utf8"));
        assert.deepEqual(restored.output[0], {
          type: "function_call",
          name: "read",
          namespace: "mcp__files__",
          call_id: "c1",
        });

        const state = createNamespaceSseState();
        const event = `data: ${JSON.stringify({ type: "response.output_item.done", item: { type: "function_call", name: flatName } })}\n\n`;
        const split = Math.floor(event.length / 2);
        const first = restoreNamespacedSseChunk(state, Buffer.from(event.slice(0, split), "utf8"), restoreMap);
        const second = restoreNamespacedSseChunk(state, Buffer.from(event.slice(split), "utf8"), restoreMap, true);
        const output = Buffer.concat([first, second]).toString("utf8");
        assert.match(output, /"name":"read"/);
        assert.match(output, /"namespace":"mcp__files__"/);
      },
    },
  ],
};
