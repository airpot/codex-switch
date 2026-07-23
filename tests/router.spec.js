"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const {
  makeSandboxCopy,
  makeToolHomeWithManagedState,
  runJsonCli,
} = require("./helpers");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(address.port);
    });
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function request(port, token, body = { model: "client-model", input: "hello" }) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(body));
    const req = http.request({
      host: "127.0.0.1",
      port,
      path: "/v1/responses?test=1",
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "content-length": payload.length,
      },
    });
    req.once("error", reject);
    req.once("response", (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.once("aborted", () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString(), aborted: true }));
      response.once("error", () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString(), aborted: true }));
      response.once("end", () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString(), aborted: false }));
    });
    req.end(payload);
  });
}

async function createUpstream(handler) {
  const server = http.createServer(handler);
  const port = await listen(server);
  return { server, port, baseUrl: `http://127.0.0.1:${port}/v1` };
}

async function createTestRouter(providers, overrides = {}) {
  const { createRouterServer } = require("../dist/runtime/router-server.js");
  const token = "local-router-token";
  const config = {
    version: 1,
    providers: Object.keys(providers),
    host: "127.0.0.1",
    port: 15721,
    failureThreshold: 3,
    cooldownMs: 1000,
    firstByteTimeoutMs: 1000,
    streamIdleTimeoutMs: 1000,
    requestTimeoutMs: 3000,
    ...overrides,
  };
  const router = createRouterServer({ config, providers: { providers }, token });
  const port = await listen(router.server);
  return { ...router, port, token };
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(JSON.parse(Buffer.concat(chunks).toString())));
  });
}

function writeProviders(toolHomeDir, providers) {
  fs.writeFileSync(path.join(toolHomeDir, "providers.json"), `${JSON.stringify({ providers }, null, 2)}\n`, "utf8");
}

module.exports = {
  name: "automatic router",
  tests: [
    {
      name: "primary receives local-authenticated requests with its own model and key",
      async run() {
        let seen = null;
        const upstream = await createUpstream(async (req, res) => {
          seen = { url: req.url, authorization: req.headers.authorization, body: await readBody(req) };
          res.writeHead(200, { "content-type": "text/event-stream" });
          res.end("data: primary\n\n");
        });
        const router = await createTestRouter({
          lxapi: { profile: "lxapi", apiKey: "sk-lxapi", model: "lx-model", baseUrl: upstream.baseUrl },
        });
        try {
          const unauthorized = await request(router.port, "wrong-token");
          assert.equal(unauthorized.status, 401);
          const result = await request(router.port, router.token);
          assert.equal(result.status, 200);
          assert.equal(result.body, "data: primary\n\n");
          assert.equal(seen.url, "/v1/responses?test=1");
          assert.equal(seen.authorization, "Bearer sk-lxapi");
          assert.equal(seen.body.model, "lx-model");
        } finally {
          await close(router.server);
          await close(upstream.server);
        }
      },
    },
    {
      name: "retryable primary response fails over to streaming secondary",
      async run() {
        let primaryCalls = 0;
        let secondaryCalls = 0;
        const primary = await createUpstream((_req, res) => {
          primaryCalls += 1;
          res.writeHead(500);
          res.end("failed");
        });
        const secondary = await createUpstream((_req, res) => {
          secondaryCalls += 1;
          res.writeHead(200, { "content-type": "text/event-stream" });
          res.write("data: one\n\n");
          res.end("data: two\n\n");
        });
        const router = await createTestRouter({
          lxapi: { profile: "lxapi", apiKey: "sk-lxapi", model: "lx", baseUrl: primary.baseUrl },
          rivo: { profile: "rivo", apiKey: "sk-rivo", model: "rivo", baseUrl: secondary.baseUrl },
        });
        try {
          const result = await request(router.port, router.token);
          assert.equal(result.status, 200);
          assert.equal(result.body, "data: one\n\ndata: two\n\n");
          assert.equal(primaryCalls, 1);
          assert.equal(secondaryCalls, 1);
        } finally {
          await close(router.server);
          await close(primary.server);
          await close(secondary.server);
        }
      },
    },
    {
      name: "first-byte timeout fails over but a 400 response does not",
      async run() {
        let mode = "timeout";
        let secondaryCalls = 0;
        const primary = await createUpstream((_req, res) => {
          if (mode === "bad-request") {
            res.writeHead(400);
            res.end("bad request");
          }
        });
        const secondary = await createUpstream((_req, res) => {
          secondaryCalls += 1;
          res.writeHead(200);
          res.end("secondary");
        });
        const router = await createTestRouter({
          lxapi: { profile: "lxapi", apiKey: "sk-lxapi", model: "lx", baseUrl: primary.baseUrl },
          rivo: { profile: "rivo", apiKey: "sk-rivo", model: "rivo", baseUrl: secondary.baseUrl },
        }, { firstByteTimeoutMs: 50 });
        try {
          let result = await request(router.port, router.token, { model: "client-model", input: "hello", stream: true });
          assert.equal(result.body, "secondary");
          assert.equal(secondaryCalls, 1);
          mode = "bad-request";
          result = await request(router.port, router.token, { model: "client-model", input: "hello", stream: true });
          assert.equal(result.status, 400);
          assert.equal(result.body, "bad request");
          assert.equal(secondaryCalls, 1);
        } finally {
          await close(router.server);
          await close(primary.server);
          await close(secondary.server);
        }
      },
    },
    {
      name: "stream failure after the first chunk is never replayed",
      async run() {
        let secondaryCalls = 0;
        const primary = await createUpstream((_req, res) => {
          res.writeHead(200, { "content-type": "text/event-stream" });
          res.write("data: committed\n\n");
          setImmediate(() => res.socket.destroy());
        });
        const secondary = await createUpstream((_req, res) => {
          secondaryCalls += 1;
          res.end("should-not-run");
        });
        const router = await createTestRouter({
          lxapi: { profile: "lxapi", apiKey: "sk-lxapi", model: "lx", baseUrl: primary.baseUrl },
          rivo: { profile: "rivo", apiKey: "sk-rivo", model: "rivo", baseUrl: secondary.baseUrl },
        });
        try {
          const result = await request(router.port, router.token, { model: "client-model", input: "hello", stream: true });
          assert.equal(result.body, "data: committed\n\n");
          assert.equal(result.aborted, true);
          assert.equal(secondaryCalls, 0);
          assert.equal(router.getCircuits()[0].state, "closed");
        } finally {
          await close(router.server);
          await close(primary.server);
          await close(secondary.server);
        }
      },
    },
    {
      name: "non-streaming body failure before completion fails over",
      async run() {
        let secondaryCalls = 0;
        const primary = await createUpstream((_req, res) => {
          res.writeHead(200, { "content-type": "application/json" });
          res.write('{"partial":');
          setImmediate(() => res.socket.destroy());
        });
        const secondary = await createUpstream((_req, res) => {
          secondaryCalls += 1;
          res.writeHead(200, { "content-type": "application/json" });
          res.end('{"ok":true}');
        });
        const router = await createTestRouter({
          lxapi: { profile: "lxapi", apiKey: "sk-lxapi", model: "lx", baseUrl: primary.baseUrl },
          rivo: { profile: "rivo", apiKey: "sk-rivo", model: "rivo", baseUrl: secondary.baseUrl },
        });
        try {
          const result = await request(router.port, router.token);
          assert.equal(result.status, 200);
          assert.equal(result.body, '{"ok":true}');
          assert.equal(result.aborted, false);
          assert.equal(secondaryCalls, 1);
          assert.equal(router.getCircuits()[0].consecutiveFailures, 1);
        } finally {
          await close(router.server);
          await close(primary.server);
          await close(secondary.server);
        }
      },
    },
    {
      name: "active streaming is not limited by the non-streaming request timeout",
      async run() {
        const primary = await createUpstream((_req, res) => {
          res.writeHead(200, { "content-type": "text/event-stream" });
          res.write("data: one\n\n");
          setTimeout(() => res.end("data: two\n\n"), 60);
        });
        const router = await createTestRouter({
          lxapi: { profile: "lxapi", apiKey: "sk-lxapi", model: "lx", baseUrl: primary.baseUrl },
        }, { requestTimeoutMs: 20, streamIdleTimeoutMs: 100 });
        try {
          const result = await request(router.port, router.token, { model: "client-model", input: "hello", stream: true });
          assert.equal(result.body, "data: one\n\ndata: two\n\n");
          assert.equal(result.aborted, false);
        } finally {
          await close(router.server);
          await close(primary.server);
        }
      },
    },
    {
      name: "stream idle timeout after commit does not fail over or poison the circuit",
      async run() {
        let secondaryCalls = 0;
        const primary = await createUpstream((_req, res) => {
          res.writeHead(200, { "content-type": "text/event-stream" });
          res.write("data: committed\n\n");
        });
        const secondary = await createUpstream((_req, res) => {
          secondaryCalls += 1;
          res.end("should-not-run");
        });
        const router = await createTestRouter({
          lxapi: { profile: "lxapi", apiKey: "sk-lxapi", model: "lx", baseUrl: primary.baseUrl },
          rivo: { profile: "rivo", apiKey: "sk-rivo", model: "rivo", baseUrl: secondary.baseUrl },
        }, { streamIdleTimeoutMs: 30 });
        try {
          const result = await request(router.port, router.token, { model: "client-model", input: "hello", stream: true });
          assert.equal(result.body, "data: committed\n\n");
          assert.equal(result.aborted, true);
          assert.equal(secondaryCalls, 0);
          assert.equal(router.getCircuits()[0].state, "closed");
          assert.equal(router.getCircuits()[0].consecutiveFailures, 0);
        } finally {
          await close(router.server);
          await close(primary.server);
          await close(secondary.server);
        }
      },
    },
    {
      name: "404 fails over while a neutral 400 preserves prior circuit failures",
      async run() {
        let mode = "not-found";
        let secondaryCalls = 0;
        const primary = await createUpstream((_req, res) => {
          res.writeHead(mode === "not-found" ? 404 : 400);
          res.end(mode);
        });
        const secondary = await createUpstream((_req, res) => {
          secondaryCalls += 1;
          res.end("secondary");
        });
        const router = await createTestRouter({
          lxapi: { profile: "lxapi", apiKey: "sk-lxapi", model: "lx", baseUrl: primary.baseUrl },
          rivo: { profile: "rivo", apiKey: "sk-rivo", model: "rivo", baseUrl: secondary.baseUrl },
        });
        try {
          assert.equal((await request(router.port, router.token)).body, "secondary");
          assert.equal(router.getCircuits()[0].consecutiveFailures, 1);
          mode = "bad-request";
          const result = await request(router.port, router.token);
          assert.equal(result.status, 400);
          assert.equal(result.body, "bad-request");
          assert.equal(secondaryCalls, 1);
          assert.equal(router.getCircuits()[0].consecutiveFailures, 1);
        } finally {
          await close(router.server);
          await close(primary.server);
          await close(secondary.server);
        }
      },
    },
    {
      name: "open circuit skips primary and half-open recovery restores priority",
      async run() {
        let primaryHealthy = false;
        let primaryCalls = 0;
        const primary = await createUpstream((_req, res) => {
          primaryCalls += 1;
          res.writeHead(primaryHealthy ? 200 : 500);
          res.end(primaryHealthy ? "primary" : "failed");
        });
        const secondary = await createUpstream((_req, res) => res.end("secondary"));
        const router = await createTestRouter({
          lxapi: { profile: "lxapi", apiKey: "sk-lxapi", model: "lx", baseUrl: primary.baseUrl },
          rivo: { profile: "rivo", apiKey: "sk-rivo", model: "rivo", baseUrl: secondary.baseUrl },
        }, { failureThreshold: 1, cooldownMs: 50 });
        try {
          assert.equal((await request(router.port, router.token)).body, "secondary");
          assert.equal((await request(router.port, router.token)).body, "secondary");
          assert.equal(primaryCalls, 1);
          primaryHealthy = true;
          await new Promise((resolve) => setTimeout(resolve, 70));
          assert.equal((await request(router.port, router.token)).body, "primary");
          assert.equal(primaryCalls, 2);
          assert.equal(router.getCircuits()[0].state, "closed");
        } finally {
          await close(router.server);
          await close(primary.server);
          await close(secondary.server);
        }
      },
    },
    {
      name: "configure validates order and start-stop restores exact Codex files",
      async run() {
        const codexDir = makeSandboxCopy();
        const toolHomeDir = makeToolHomeWithManagedState();
        const upstream = await createUpstream((_req, res) => res.end("ok"));
        writeProviders(toolHomeDir, {
          lxapi: { profile: "lxapi", apiKey: "sk-lxapi", model: "lx-model", baseUrl: upstream.baseUrl },
          rivo: { profile: "rivo", apiKey: "sk-rivo", model: "rivo-model", baseUrl: upstream.baseUrl },
        });
        const portHolder = http.createServer();
        const port = await listen(portHolder);
        await close(portHolder);
        const originalConfig = fs.readFileSync(path.join(codexDir, "config.toml"), "utf8");
        const originalAuth = fs.readFileSync(path.join(codexDir, "auth.json"), "utf8");
        try {
          let result = await runJsonCli({
            toolHomeDir,
            args: [
              "route", "configure", "lxapi", "rivo",
              "--port", String(port),
              "--stream-idle-timeout-seconds", "45",
              "--json", "--codex-dir", codexDir,
            ],
          });
          assert.equal(result.payload.ok, true);
          assert.deepEqual(result.payload.data.providerOrder, ["lxapi", "rivo"]);
          assert.equal(result.payload.data.streamIdleTimeoutSeconds, 45);
          const routeConfig = JSON.parse(fs.readFileSync(path.join(toolHomeDir, "router.json"), "utf8"));
          assert.equal(routeConfig.streamIdleTimeoutMs, 45_000);

          result = await runJsonCli({ toolHomeDir, args: ["route", "start", "--json", "--codex-dir", codexDir] });
          assert.equal(result.payload.ok, true);
          const activeConfig = fs.readFileSync(path.join(codexDir, "config.toml"), "utf8");
          assert.match(activeConfig, /model_provider = "freemodel"/);
          assert.match(activeConfig, /model = "gpt-5\.4"/);
          assert.match(activeConfig, /\[model_providers\.freemodel\][\s\S]*base_url = "http:\/\/127\.0\.0\.1:/);
          assert.doesNotMatch(activeConfig, /model_provider = "codexs-router"/);
          const stateMode = fs.statSync(path.join(toolHomeDir, "router-state.json")).mode & 0o777;
          const secretMode = fs.statSync(path.join(toolHomeDir, "router-token")).mode & 0o777;
          const firstToken = fs.readFileSync(path.join(toolHomeDir, "router-token"), "utf8");
          assert.equal(stateMode, 0o600);
          assert.equal(secretMode, 0o600);

          result = await runJsonCli({ toolHomeDir, args: ["route", "status", "--json", "--codex-dir", codexDir] });
          assert.equal(result.payload.data.running, true);
          assert.deepEqual(result.payload.data.providerOrder, ["lxapi", "rivo"]);

          result = await runJsonCli({ toolHomeDir, args: ["route", "stop", "--json", "--codex-dir", codexDir] });
          assert.equal(result.payload.ok, true);
          assert.equal(result.payload.data.restored, true);
          assert.equal(fs.readFileSync(path.join(codexDir, "config.toml"), "utf8"), originalConfig);
          assert.equal(fs.readFileSync(path.join(codexDir, "auth.json"), "utf8"), originalAuth);
          assert.equal(fs.readFileSync(path.join(toolHomeDir, "router-token"), "utf8"), firstToken);

          result = await runJsonCli({ toolHomeDir, args: ["route", "start", "--json", "--codex-dir", codexDir] });
          assert.equal(result.payload.ok, true);
          assert.equal(fs.readFileSync(path.join(toolHomeDir, "router-token"), "utf8"), firstToken);
          result = await runJsonCli({ toolHomeDir, args: ["route", "stop", "--json", "--codex-dir", codexDir] });
          assert.equal(result.payload.ok, true);

          result = await runJsonCli({ toolHomeDir, args: ["route", "start", "--rotate-token", "--json", "--codex-dir", codexDir] });
          assert.equal(result.payload.ok, true);
          assert.notEqual(fs.readFileSync(path.join(toolHomeDir, "router-token"), "utf8"), firstToken);
          result = await runJsonCli({ toolHomeDir, args: ["route", "stop", "--json", "--codex-dir", codexDir] });
          assert.equal(result.payload.ok, true);
        } finally {
          if (fs.existsSync(path.join(toolHomeDir, "router-state.json"))) {
            await runJsonCli({ toolHomeDir, args: ["route", "stop", "--force", "--json", "--codex-dir", codexDir] });
          }
          await close(upstream.server);
        }
      },
    },
    {
      name: "configure rejects duplicate and missing providers",
      async run() {
        const codexDir = makeSandboxCopy();
        const toolHomeDir = makeToolHomeWithManagedState();
        writeProviders(toolHomeDir, {
          lxapi: { profile: "lxapi", apiKey: "sk-lxapi", model: "lx", baseUrl: "http://127.0.0.1:1/v1" },
        });
        let result = await runJsonCli({
          toolHomeDir,
          args: ["route", "configure", "lxapi", "lxapi", "--json", "--codex-dir", codexDir],
        });
        assert.equal(result.payload.error.code, "INVALID_ARGUMENT");
        result = await runJsonCli({
          toolHomeDir,
          args: ["route", "configure", "lxapi", "rivo", "--json", "--codex-dir", codexDir],
        });
        assert.equal(result.payload.error.code, "PROVIDER_NOT_FOUND");
      },
    },
  ],
};
