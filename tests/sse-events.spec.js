"use strict";

const assert = require("node:assert/strict");
const {
  createResponsesSseState,
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
          { hasRealData: false, failures: [] }
        );
      },
    },
    {
      name: "recognizes split real events and failed responses",
      run() {
        const state = createResponsesSseState();
        assert.deepEqual(
          inspectResponsesSseChunk(state, Buffer.from('data: {"type":"response.output_text')),
          { hasRealData: false, failures: [] }
        );
        assert.deepEqual(
          inspectResponsesSseChunk(state, Buffer.from('_delta","delta":"ok"}\n\n')),
          { hasRealData: true, failures: [] }
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
          failures: [],
          requestId: "req-success",
        });
      },
    },
  ],
};
