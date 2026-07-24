"use strict";

const assert = require("node:assert/strict");
const zlib = require("node:zlib");
const { decodeContentEncodedBody } = require("../dist/runtime/content-encoding.js");
const { prepareResponsesRequest } = require("../dist/runtime/responses-compat.js");

module.exports = {
  name: "Responses compatibility profiles",
  tests: [
    {
      name: "strict mode preserves prompt-cache routing while normalizing private fields",
      run() {
        const body = Buffer.from(JSON.stringify({
          model: "gpt-5",
          prompt_cache_retention: "24h",
          prompt_cache_key: "stable-session-key",
          safety_identifier: "private",
          external_web_access: true,
          tools: [{ type: "function", name: "existing", parameters: {} }],
          input: [
            { type: "reasoning", content: null },
            { type: "additional_tools", tools: [{ type: "function", name: "extra", parameters: { external_web_access: true } }] },
          ],
        }));
        const transformed = prepareResponsesRequest(body, "application/json", "strict");
        const payload = JSON.parse(transformed.body.toString("utf8"));
        assert.equal(transformed.changed, true);
        assert.equal(payload.prompt_cache_retention, "24h");
        assert.equal(payload.prompt_cache_key, "stable-session-key");
        assert.equal("safety_identifier" in payload, false);
        assert.equal("external_web_access" in payload, false);
        assert.deepEqual(payload.tools.map((tool) => tool.name), ["existing", "extra"]);
        assert.equal(payload.input.length, 1);
        assert.equal("content" in payload.input[0], false);
        assert.equal(JSON.stringify(payload).includes("external_web_access"), false);
      },
    },
    {
      name: "xai mode filters unsupported tools while native mode is byte-identical",
      run() {
        const body = Buffer.from(JSON.stringify({
          model: "prefix/grok-4.5",
          prompt_cache_retention: "24h",
          stop: ["x"],
          tools: [{ type: "function", name: "kept" }, { type: "custom", name: "removed" }],
          tool_choice: { type: "custom", name: "removed" },
        }));
        const native = prepareResponsesRequest(body, "application/json", "native");
        assert.equal(native.changed, false);
        assert.equal(native.body, body);

        const xai = prepareResponsesRequest(body, "application/json", "xai");
        const payload = JSON.parse(xai.body.toString("utf8"));
        assert.deepEqual(payload.tools.map((tool) => tool.name), ["kept"]);
        assert.equal("prompt_cache_retention" in payload, false);
        assert.equal("tool_choice" in payload, false);
        assert.equal("stop" in payload, false);
      },
    },
    {
      name: "decodes stacked HTTP content encodings in reverse order",
      run() {
        const body = Buffer.from('{"ok":true}');
        const gzip = zlib.gzipSync(body);
        const stacked = zlib.brotliCompressSync(gzip);
        const decoded = decodeContentEncodedBody(stacked, "gzip, br");
        assert.equal(decoded.decoded, true);
        assert.deepEqual(decoded.body, body);
        assert.throws(() => decodeContentEncodedBody(body, "snappy"), /Unsupported content encoding/);
      },
    },
  ],
};
