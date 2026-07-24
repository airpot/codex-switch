"use strict";

const assert = require("node:assert/strict");
const {
  createResponsesSseState,
  inspectResponsesJsonBody,
  inspectResponsesSseChunk,
} = require("../dist/runtime/sse-events.js");

module.exports = {
  name: "Responses SSE event inspection",
  tests: [
    {
      name: "ignores comments, heartbeats, empty data, and done markers",
      run() {
        const state = createResponsesSseState();
        assert.deepEqual(
          inspectResponsesSseChunk(state, Buffer.from(": ping\n\ndata:\n\ndata: [DONE]\n\n")),
          { hasRealData: false, hasActivity: true, failures: [] }
        );
      },
    },
    {
      name: "recognizes split real events and failed responses",
      run() {
        const state = createResponsesSseState();
        assert.deepEqual(
          inspectResponsesSseChunk(state, Buffer.from('data: {"type":"response.output_text')),
          { hasRealData: false, hasActivity: false, failures: [] }
        );
        assert.deepEqual(
          inspectResponsesSseChunk(state, Buffer.from('_delta","delta":"ok"}\n\n')),
          { hasRealData: true, hasActivity: true, failures: [] }
        );
        const failure = inspectResponsesSseChunk(
          state,
          Buffer.from('event: response.failed\ndata: {"type":"response.failed","request_id":"upstream-123","error":{"message":"busy"}}\n\n')
        );
        assert.equal(failure.hasRealData, false);
        assert.equal(failure.requestId, "upstream-123");
        assert.deepEqual(failure.failures, [{
          type: "response.failed",
          requestId: "upstream-123",
          message: "busy",
        }]);
      },
    },
    {
      name: "flushes a final event without a blank-line delimiter",
      run() {
        const state = createResponsesSseState();
        const result = inspectResponsesSseChunk(
          state,
          Buffer.from('data: {"type":"response.incomplete"}'),
          true
        );
        assert.equal(result.hasRealData, false);
        assert.equal(result.failures[0].type, "response.incomplete");
      },
    },
    {
      name: "recognizes an error object even when the event name is omitted",
      run() {
        const state = createResponsesSseState();
        const result = inspectResponsesSseChunk(
          state,
          Buffer.from('data: {"error":{"message":"upstream unavailable"},"request_id":"req-9"}\n\n')
        );
        assert.deepEqual(result.failures, [{
          type: "error",
          message: "upstream unavailable",
          requestId: "req-9",
        }]);
      },
    },
    {
      name: "recognizes a named error event without a data payload",
      run() {
        const state = createResponsesSseState();
        const result = inspectResponsesSseChunk(state, Buffer.from("event: error\n\n"));
        assert.deepEqual(result.failures, [{ type: "error" }]);
      },
    },
    {
      name: "keeps a successful event real when it carries a request id",
      run() {
        const state = createResponsesSseState();
        const result = inspectResponsesSseChunk(
          state,
          Buffer.from('data: {"type":"response.output_text.delta","delta":"ok","request_id":"req-success"}\n\n')
        );
        assert.deepEqual(result, {
          hasRealData: true,
          hasActivity: true,
          failures: [],
          requestId: "req-success",
        });
      },
    },
    {
      name: "keeps lifecycle events pre-commit and recognizes nested response failures",
      run() {
        const state = createResponsesSseState();
        const lifecycle = inspectResponsesSseChunk(
          state,
          Buffer.from('event: response.created\ndata: {"type":"response.created","response":{"id":"resp-1","status":"in_progress"}}\n\n')
        );
        assert.equal(lifecycle.hasRealData, false);
        assert.equal(lifecycle.hasActivity, true);

        const failure = inspectResponsesSseChunk(
          state,
          Buffer.from('event: response.failed\ndata: {"type":"response.failed","response":{"status":"failed","request_id":"nested-123","error":{"message":"capacity unavailable"}}}\n\n')
        );
        assert.equal(failure.hasRealData, false);
        assert.equal(failure.failures[0].type, "response.failed");
        assert.equal(failure.failures[0].message, "capacity unavailable");
        assert.equal(failure.requestId, "nested-123");
      },
    },
    {
      name: "honors named lifecycle and failure events with non-JSON data",
      run() {
        const lifecycleState = createResponsesSseState();
        const lifecycle = inspectResponsesSseChunk(
          lifecycleState,
          Buffer.from("event: response.in_progress\ndata: still working\n\n")
        );
        assert.equal(lifecycle.hasRealData, false);
        assert.equal(lifecycle.hasActivity, true);

        const failureState = createResponsesSseState();
        const failure = inspectResponsesSseChunk(
          failureState,
          Buffer.from("event: error\ndata: upstream unavailable request_id=req-plain-1\n\n")
        );
        assert.equal(failure.hasRealData, false);
        assert.equal(failure.failures[0].type, "error");
        assert.equal(failure.failures[0].message, "upstream unavailable request_id=req-plain-1");
        assert.equal(failure.requestId, "req-plain-1");
      },
    },
    {
      name: "extracts cached token usage from completed SSE and buffered JSON",
      run() {
        const state = createResponsesSseState();
        const sse = inspectResponsesSseChunk(
          state,
          Buffer.from('data: {"type":"response.completed","response":{"status":"completed","usage":{"input_tokens":1000,"input_tokens_details":{"cached_tokens":900},"output_tokens":50}}}\n\n')
        );
        assert.deepEqual(sse.usage, {
          inputTokens: 1000,
          cachedInputTokens: 900,
          outputTokens: 50,
        });

        const json = inspectResponsesJsonBody(Buffer.from(JSON.stringify({
          status: "completed",
          usage: {
            input_tokens: 2000,
            input_tokens_details: { cached_tokens: 1800 },
            output_tokens: 75,
          },
        })));
        assert.deepEqual(json.usage, {
          inputTokens: 2000,
          cachedInputTokens: 1800,
          outputTokens: 75,
        });
      },
    },
  ],
};
