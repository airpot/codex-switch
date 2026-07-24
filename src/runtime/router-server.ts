import * as http from "node:http";
import * as https from "node:https";
import { URL } from "node:url";
import {
  ProviderRecord,
  ProvidersFile,
  resolveResponsesCompatibility,
} from "../domain/providers";
import { CircuitStatus, RouterConfig, isRetryableStatus } from "../domain/router";
import {
  decodeContentEncodedBody,
  parseContentEncodings,
} from "./content-encoding";
import {
  createNamespaceSseState,
  restoreNamespacedResponse,
  restoreNamespacedSseChunk,
} from "./namespace-transform";
import { prepareResponsesRequest } from "./responses-compat";
import {
  createResponsesSseState,
  inspectResponsesSseChunk,
  ResponsesSseFailure,
} from "./sse-events";

const MAX_REQUEST_BYTES = 32 * 1024 * 1024;
const BLOCKED_REQUEST_HEADERS = new Set([
  "api-key",
  "authorization",
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "x-api-key",
]);
const BLOCKED_RESPONSE_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
const MAX_PENDING_SSE_BYTES = 1 * 1024 * 1024;

type CircuitEntry = {
  state: "closed" | "open" | "half-open";
  consecutiveFailures: number;
  openedAt: number | null;
  probeInFlight: boolean;
};

type AttemptResult =
  | { outcome: "success"; upstreamRequestId?: string; upstreamStatus?: number }
  | { outcome: "neutral"; upstreamRequestId?: string; upstreamStatus?: number }
  | {
      outcome: "retry";
      retryReason: string;
      failureKind: "provider" | "request";
      requestStatus?: 400 | 413;
      upstreamRequestId?: string;
      upstreamStatus?: number;
    };

export type RouterServer = {
  server: http.Server;
  getCircuits: () => CircuitStatus[];
};

/**
 * Creates an authenticated localhost reverse proxy with ordered failover and per-provider circuits.
 */
export function createRouterServer(args: {
  config: RouterConfig;
  providers: ProvidersFile;
  token: string;
  logger?: (message: string) => void;
}): RouterServer {
  const circuits = new Map<string, CircuitEntry>();
  const startedAt = Date.now();
  for (const provider of args.config.providers) {
    circuits.set(provider, {
      state: "closed",
      consecutiveFailures: 0,
      openedAt: null,
      probeInFlight: false,
    });
  }

  const getCircuits = (): CircuitStatus[] => args.config.providers.map((provider) => {
    const circuit = circuits.get(provider)!;
    return {
      provider,
      state: circuit.state,
      consecutiveFailures: circuit.consecutiveFailures,
      retryAt: circuit.openedAt === null ? null : new Date(circuit.openedAt + args.config.cooldownMs).toISOString(),
    };
  });

  const server = http.createServer(async (request, response) => {
    if (!hasValidToken(request, args.token)) {
      writeJson(response, 401, { error: "Unauthorized" });
      return;
    }

    if (request.url === "/healthz" && request.method === "GET") {
      writeJson(response, 200, {
        ok: true,
        pid: process.pid,
        uptimeMs: Date.now() - startedAt,
        providers: args.config.providers,
        circuits: getCircuits(),
      });
      return;
    }

    let body: Buffer;
    try {
      body = await readRequestBody(request);
    } catch (error: unknown) {
      if (!response.headersSent && !response.destroyed) {
        const tooLarge = error instanceof Error && error.message === "REQUEST_TOO_LARGE";
        writeJson(response, tooLarge ? 413 : 400, { error: tooLarge ? "Request body is too large" : "Failed to read request body" });
      }
      return;
    }

    const attempted = new Set<string>();
    const failures: Array<{ provider: string; reason: string }> = [];
    let hasProviderFailure = false;
    let requestFailureStatus: 400 | 413 = 400;
    while (!response.destroyed) {
      const providerName = selectProvider(args.config, circuits, attempted);
      if (!providerName) {
        const statusCode = attempted.size === 0 ? 503 : hasProviderFailure ? 502 : requestFailureStatus;
        writeJson(response, statusCode, {
          error: attempted.size === 0
            ? "All provider circuits are cooling down"
            : hasProviderFailure
              ? "All available providers failed"
              : "Request is incompatible with all configured providers",
          attempts: failures,
        });
        return;
      }

      attempted.add(providerName);
      const provider = args.providers.providers[providerName];
      const result = await forwardAttempt({
        request,
        response,
        body,
        providerName,
        provider,
        config: args.config,
      });

      if (result.outcome === "success") {
        markCircuitSuccess(circuits.get(providerName)!);
        logAttempt(args.logger, providerName, result);
        return;
      }
      if (result.outcome === "neutral") {
        markCircuitNeutral(circuits.get(providerName)!);
        logAttempt(args.logger, providerName, result);
        return;
      }

      const reason = result.retryReason;
      failures.push({ provider: providerName, reason });
      if (result.failureKind === "provider") {
        hasProviderFailure = true;
        markCircuitFailure(circuits.get(providerName)!, args.config);
        logAttempt(args.logger, providerName, result);
      } else {
        requestFailureStatus = result.requestStatus ?? requestFailureStatus;
        markCircuitNeutral(circuits.get(providerName)!);
        logAttempt(args.logger, providerName, result);
      }
    }
  });

  server.on("clientError", (_error, socket) => {
    socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
  });

  return { server, getCircuits };
}

function logAttempt(logger: ((message: string) => void) | undefined, providerName: string, result: AttemptResult): void {
  if (!logger) {
    return;
  }
  const requestId = result.upstreamRequestId ?? "none";
  const status = result.upstreamStatus === undefined ? "unknown" : String(result.upstreamStatus);
  if (result.outcome === "retry") {
    const category = result.failureKind === "provider" ? "failover" : "request_rejected";
    logger(`provider=${providerName} ${category}=${result.retryReason} upstream_status=${status} upstream_request_id=${requestId}`);
    return;
  }
  logger(`provider=${providerName} outcome=${result.outcome} upstream_status=${status} upstream_request_id=${requestId}`);
}

/**
 * Joins a provider base URL with an incoming Codex path without duplicating a trailing /v1.
 */
export function joinProviderUrl(baseUrl: string, incomingUrl: string): URL {
  const base = new URL(baseUrl);
  const incoming = new URL(incomingUrl, "http://127.0.0.1");
  let incomingPath = incoming.pathname;
  const basePath = base.pathname.replace(/\/$/, "");
  if (basePath.endsWith("/v1") && (incomingPath === "/v1" || incomingPath.startsWith("/v1/"))) {
    incomingPath = incomingPath.slice(3) || "/";
  }
  base.pathname = `${basePath}${incomingPath.startsWith("/") ? incomingPath : `/${incomingPath}`}` || "/";
  base.search = incoming.search;
  base.hash = "";
  return base;
}

/**
 * Rewrites the JSON model field for the selected provider while preserving non-JSON payloads.
 */
export function rewriteRequestModel(body: Buffer, contentType: string | undefined, model: string | undefined): Buffer {
  if (body.length === 0 || !model || !contentType || !/(?:application\/json|\+json)(?:;|$)/i.test(contentType)) {
    return body;
  }
  try {
    const payload = JSON.parse(body.toString("utf8"));
    if (!payload || typeof payload !== "object" || Array.isArray(payload) || !("model" in payload)) {
      return body;
    }
    return Buffer.from(JSON.stringify({ ...payload, model }), "utf8");
  } catch {
    return body;
  }
}

/**
 * Detects requests whose successful response body must remain live instead of being buffered.
 */
function isStreamingRequest(body: Buffer, headers: http.IncomingHttpHeaders): boolean {
  const accept = Array.isArray(headers.accept) ? headers.accept.join(",") : headers.accept;
  if (accept?.toLowerCase().includes("text/event-stream")) {
    return true;
  }
  if (body.length === 0) {
    return false;
  }
  try {
    const payload = JSON.parse(body.toString("utf8"));
    return Boolean(payload && typeof payload === "object" && !Array.isArray(payload) && payload.stream === true);
  } catch {
    return false;
  }
}

function selectProvider(
  config: RouterConfig,
  circuits: Map<string, CircuitEntry>,
  attempted: Set<string>
): string | null {
  const now = Date.now();
  for (const provider of config.providers) {
    if (attempted.has(provider)) {
      continue;
    }
    const circuit = circuits.get(provider)!;
    if (circuit.state === "open") {
      if (circuit.openedAt === null || now - circuit.openedAt < config.cooldownMs) {
        continue;
      }
      circuit.state = "half-open";
      circuit.probeInFlight = false;
    }
    if (circuit.state === "half-open") {
      if (circuit.probeInFlight) {
        continue;
      }
      circuit.probeInFlight = true;
    }
    return provider;
  }
  return null;
}

function markCircuitSuccess(circuit: CircuitEntry): void {
  circuit.state = "closed";
  circuit.consecutiveFailures = 0;
  circuit.openedAt = null;
  circuit.probeInFlight = false;
}

function markCircuitNeutral(circuit: CircuitEntry): void {
  circuit.probeInFlight = false;
}

function markCircuitFailure(circuit: CircuitEntry, config: RouterConfig): void {
  circuit.consecutiveFailures += 1;
  circuit.probeInFlight = false;
  if (circuit.state === "half-open" || circuit.consecutiveFailures >= config.failureThreshold) {
    circuit.state = "open";
    circuit.openedAt = Date.now();
  }
}

function forwardAttempt(args: {
  request: http.IncomingMessage;
  response: http.ServerResponse;
  body: Buffer;
  providerName: string;
  provider: ProviderRecord;
  config: RouterConfig;
}): Promise<AttemptResult> {
  return new Promise((resolve) => {
    if (!args.provider.baseUrl) {
      resolve({ outcome: "retry", retryReason: "provider has no base URL", failureKind: "provider" });
      return;
    }

    let target: URL;
    try {
      target = joinProviderUrl(args.provider.baseUrl, args.request.url ?? "/");
    } catch {
      resolve({ outcome: "retry", retryReason: "provider has an invalid base URL", failureKind: "provider" });
      return;
    }

    const contentType = headerString(args.request.headers["content-type"]);
    const compatibility = resolveResponsesCompatibility(args.provider);
    let attemptBody = args.body;
    let requestBodyDecoded = false;
    if (compatibility !== "native") {
      try {
        const decoded = decodeContentEncodedBody(
          args.body,
          headerString(args.request.headers["content-encoding"])
        );
        attemptBody = decoded.body;
        requestBodyDecoded = decoded.decoded;
        if (attemptBody.length > MAX_REQUEST_BYTES) {
          resolve({
            outcome: "retry",
            retryReason: "decoded request body is too large",
            failureKind: "request",
            requestStatus: 413,
          });
          return;
        }
      } catch (error: unknown) {
        resolve({
          outcome: "retry",
          retryReason: error instanceof Error ? `request decode error (${error.message})` : "request decode error",
          failureKind: "request",
          requestStatus: 400,
        });
        return;
      }
    }
    let preparedRequest;
    try {
      preparedRequest = prepareResponsesRequest(
        attemptBody,
        contentType,
        compatibility
      );
    } catch (error: unknown) {
      resolve({
        outcome: "retry",
        retryReason: error instanceof Error ? `request compatibility error (${error.message})` : "request compatibility error",
        failureKind: "request",
        requestStatus: 400,
      });
      return;
    }

    const outgoingBody = rewriteRequestModel(
      preparedRequest.body,
      contentType,
      args.provider.model
    );
    const transport = target.protocol === "https:" ? https : http;
    const requestIsStreaming = isStreamingRequest(preparedRequest.body, args.request.headers);
    const headers = buildUpstreamHeaders(
      args.request.headers,
      args.provider.apiKey,
      outgoingBody.length,
      {
        requestBodyDecoded,
        forceIdentityEncoding: requestIsStreaming || preparedRequest.changed,
      }
    );
    let settled = false;
    let committed = false;
    let responseEnded = false;
    let responseOutcome: "success" | "neutral" = "success";
    const bufferedChunks: Buffer[] = [];
    let firstByteTimer: NodeJS.Timeout | null = null;
    let requestTimer: NodeJS.Timeout | null = null;
    let streamIdleTimer: NodeJS.Timeout | null = null;
    let upstreamResponse: http.IncomingMessage | null = null;
    let upstreamRequestId: string | undefined;
    let upstreamStatus: number | undefined;
    const namespaceSseState = createNamespaceSseState();
    const responsesSseState = createResponsesSseState();
    const pendingSseChunks: Buffer[] = [];
    let pendingSseBytes = 0;

    const finish = (result: AttemptResult): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearAttemptTimers();
      args.request.off("aborted", clientAborted);
      args.response.off("close", clientClosed);
      resolve(result);
    };

    const fail = (reason: string, requestId?: string): void => {
      if (settled) {
        return;
      }
      upstreamRequestId ??= requestId;
      if (committed) {
        finish({ outcome: responseOutcome, upstreamRequestId, upstreamStatus });
        upstreamResponse?.destroy();
        upstreamRequest.destroy();
        args.response.destroy();
        // The response is already committed, so replay is unsafe and the provider did
        // deliver usable data. Do not poison its circuit because the stream closed late.
        return;
      }
      finish({ outcome: "retry", retryReason: reason, failureKind: "provider", upstreamRequestId, upstreamStatus });
      upstreamResponse?.destroy();
      upstreamRequest.destroy();
    };

    const clientAborted = (): void => {
      upstreamResponse?.destroy();
      upstreamRequest.destroy();
      finish({ outcome: committed ? responseOutcome : "neutral", upstreamRequestId, upstreamStatus });
    };
    const clientClosed = (): void => {
      if (!args.response.writableEnded) {
        clientAborted();
      }
    };

    const requestOptions: http.RequestOptions & { autoSelectFamily: boolean } = {
      method: args.request.method,
      headers,
      // Node's family autoselection can report ETIMEDOUT on IPv4-first hosts whose
      // IPv6 route is unavailable. Follow the system resolver order deterministically.
      autoSelectFamily: false,
    };
    const upstreamRequest = transport.request(target, requestOptions);

    args.request.once("aborted", clientAborted);
    args.response.once("close", clientClosed);
    if (requestIsStreaming) {
      firstByteTimer = setTimeout(() => fail("first-byte timeout"), args.config.firstByteTimeoutMs);
    } else {
      requestTimer = setTimeout(() => fail("request timeout"), args.config.requestTimeoutMs);
    }

    upstreamRequest.once("error", (error) => fail(sanitizeNetworkError(error)));
    upstreamRequest.once("response", (candidateResponse) => {
      upstreamResponse = candidateResponse;
      const statusCode = candidateResponse.statusCode ?? 502;
      upstreamStatus = statusCode;
      upstreamRequestId = getUpstreamRequestId(candidateResponse.headers);
      if (isRetryableStatus(statusCode)) {
        candidateResponse.resume();
        candidateResponse.destroy();
        finish({
          outcome: "retry",
          retryReason: `HTTP ${statusCode}`,
          failureKind: "provider",
          upstreamRequestId,
          upstreamStatus,
        });
        return;
      }
      responseOutcome = statusCode >= 200 && statusCode < 300 ? "success" : "neutral";
      const streamResponse = responseOutcome === "success" && isSseResponse(candidateResponse);
      if (streamResponse) {
        if (requestTimer) {
          clearTimeout(requestTimer);
          requestTimer = null;
        }
        if (!firstByteTimer) {
          firstByteTimer = setTimeout(() => fail("first-byte timeout"), args.config.firstByteTimeoutMs);
        }
      } else {
        if (firstByteTimer) {
          clearTimeout(firstByteTimer);
          firstByteTimer = null;
        }
        if (!requestTimer) {
          requestTimer = setTimeout(() => fail("request timeout"), args.config.requestTimeoutMs);
        }
      }

      const responseContentEncoding = headerString(candidateResponse.headers["content-encoding"]);
      if (
        streamResponse &&
        preparedRequest.restoreMap.size > 0 &&
        parseContentEncodings(responseContentEncoding).length > 0
      ) {
        candidateResponse.resume();
        candidateResponse.destroy();
        finish({
          outcome: "retry",
          retryReason: `compressed SSE response (${responseContentEncoding})`,
          failureKind: "provider",
        });
        return;
      }

      const commitStreamingResponse = (): void => {
        if (committed) {
          return;
        }
        committed = true;
        if (firstByteTimer) {
          clearTimeout(firstByteTimer);
          firstByteTimer = null;
        }
        commitUpstreamResponse(
          args.response,
          candidateResponse,
          preparedRequest.restoreMap.size > 0 ? null : undefined
        );
      };

      candidateResponse.on("data", (chunk: Buffer) => {
        if (settled) {
          return;
        }
        if (!streamResponse) {
          bufferedChunks.push(chunk);
          return;
        }
        const inspection = inspectResponsesSseChunk(responsesSseState, chunk);
        upstreamRequestId ??= inspection.requestId;
        const failure = inspection.failures[0];
        if (failure && !committed) {
          fail(formatSseFailureReason(failure), failure.requestId);
          return;
        }
        if (inspection.hasRealData) {
          resetStreamIdleTimer();
        }
        const outputChunk = restoreNamespacedSseChunk(
          namespaceSseState,
          chunk,
          preparedRequest.restoreMap
        );
        if (outputChunk.length === 0) {
          return;
        }
        if (!committed && !inspection.hasRealData) {
          if (isPotentialSseData(outputChunk)) {
            pendingSseChunks.push(outputChunk);
            pendingSseBytes += outputChunk.length;
            if (pendingSseBytes > MAX_PENDING_SSE_BYTES) {
              fail("SSE pre-commit buffer exceeded");
            }
          }
          return;
        }
        if (!committed) {
          commitStreamingResponse();
          for (const pendingChunk of pendingSseChunks.splice(0)) {
            pendingSseBytes -= pendingChunk.length;
            if (!args.response.write(pendingChunk)) {
              candidateResponse.pause();
              args.response.once("drain", () => candidateResponse.resume());
            }
          }
        }
        if (!args.response.write(outputChunk)) {
          candidateResponse.pause();
          args.response.once("drain", () => candidateResponse.resume());
        }
      });
      candidateResponse.once("end", () => {
        responseEnded = true;
        if (settled) {
          return;
        }
        if (streamResponse) {
          const trailingInspection = inspectResponsesSseChunk(
            responsesSseState,
            Buffer.alloc(0),
            true
          );
          upstreamRequestId ??= trailingInspection.requestId;
          const trailingFailure = trailingInspection.failures[0];
          if (trailingFailure && !committed) {
            fail(formatSseFailureReason(trailingFailure), trailingFailure.requestId);
            return;
          }
          const trailingChunk = restoreNamespacedSseChunk(
            namespaceSseState,
            Buffer.alloc(0),
            preparedRequest.restoreMap,
            true
          );
          if (trailingInspection.hasRealData) {
            resetStreamIdleTimer();
          }
          if (!committed && trailingInspection.hasRealData) {
            commitStreamingResponse();
            for (const pendingChunk of pendingSseChunks.splice(0)) {
              pendingSseBytes -= pendingChunk.length;
              args.response.write(pendingChunk);
            }
            if (trailingChunk.length > 0) {
              args.response.write(trailingChunk);
            }
          } else if (trailingChunk.length > 0 && committed) {
            args.response.write(trailingChunk);
          }
          if (!committed) {
            fail("stream ended before real data");
            return;
          }
          args.response.end();
          finish({ outcome: responseOutcome, upstreamRequestId, upstreamStatus });
          return;
        }
        if (requestTimer) {
          clearTimeout(requestTimer);
          requestTimer = null;
        }
        let bufferedBody: Buffer = Buffer.concat(bufferedChunks);
        let responseBodyDecoded = false;
        if (
          preparedRequest.restoreMap.size > 0 &&
          parseContentEncodings(responseContentEncoding).length > 0
        ) {
          try {
            const decoded = decodeContentEncodedBody(bufferedBody, responseContentEncoding);
            bufferedBody = decoded.body;
            responseBodyDecoded = decoded.decoded;
          } catch (error: unknown) {
            fail(error instanceof Error ? `response decode error (${error.message})` : "response decode error");
            return;
          }
        }
        const responseBody = restoreNamespacedResponse(bufferedBody, preparedRequest.restoreMap);
        committed = true;
        if (!args.response.headersSent) {
          commitUpstreamResponse(
            args.response,
            candidateResponse,
            preparedRequest.restoreMap.size > 0 || responseBodyDecoded ? responseBody.length : undefined,
            responseBodyDecoded
          );
        }
        args.response.end(responseBody);
        finish({ outcome: responseOutcome, upstreamRequestId, upstreamStatus });
      });
      candidateResponse.once("aborted", () => fail("upstream stream aborted"));
      candidateResponse.once("error", (error) => fail(sanitizeNetworkError(error)));
      candidateResponse.once("close", () => {
        if (!responseEnded && !settled) {
          fail("upstream stream closed");
        }
      });
    });

    if (outgoingBody.length > 0) {
      upstreamRequest.write(outgoingBody);
    }
    upstreamRequest.end();

    function clearAttemptTimers(): void {
      if (firstByteTimer) {
        clearTimeout(firstByteTimer);
        firstByteTimer = null;
      }
      if (requestTimer) {
        clearTimeout(requestTimer);
        requestTimer = null;
      }
      if (streamIdleTimer) {
        clearTimeout(streamIdleTimer);
        streamIdleTimer = null;
      }
    }

    function resetStreamIdleTimer(): void {
      if (streamIdleTimer) {
        clearTimeout(streamIdleTimer);
      }
      streamIdleTimer = setTimeout(
        () => fail("stream idle timeout"),
        args.config.streamIdleTimeoutMs
      );
    }
  });
}

function hasValidToken(request: http.IncomingMessage, token: string): boolean {
  const authorization = request.headers.authorization;
  return typeof authorization === "string" && authorization === `Bearer ${token}`;
}

function readRequestBody(request: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_REQUEST_BYTES) {
        reject(new Error("REQUEST_TOO_LARGE"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.once("end", () => resolve(Buffer.concat(chunks)));
    request.once("aborted", () => reject(new Error("CLIENT_ABORTED")));
    request.once("error", reject);
  });
}

function buildUpstreamHeaders(
  source: http.IncomingHttpHeaders,
  apiKey: string,
  contentLength: number,
  options: {
    requestBodyDecoded: boolean;
    forceIdentityEncoding: boolean;
  }
): http.OutgoingHttpHeaders {
  const headers: http.OutgoingHttpHeaders = {};
  const connectionHeaders = new Set(
    (typeof source.connection === "string" ? source.connection.split(",") : [])
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
  for (const [name, value] of Object.entries(source)) {
    const lowerName = name.toLowerCase();
    if (
      value === undefined ||
      BLOCKED_REQUEST_HEADERS.has(lowerName) ||
      connectionHeaders.has(lowerName) ||
      (options.requestBodyDecoded && lowerName === "content-encoding") ||
      (options.forceIdentityEncoding && lowerName === "accept-encoding")
    ) {
      continue;
    }
    headers[name] = value;
  }
  headers.authorization = `Bearer ${apiKey}`;
  if (options.forceIdentityEncoding) {
    headers["accept-encoding"] = "identity";
  }
  if (contentLength > 0) {
    headers["content-length"] = contentLength;
  }
  return headers;
}

function commitUpstreamResponse(
  response: http.ServerResponse,
  upstream: http.IncomingMessage,
  contentLength?: number | null,
  stripContentEncoding = false
): void {
  const headers: http.OutgoingHttpHeaders = {};
  const connectionHeaders = new Set(
    (typeof upstream.headers.connection === "string" ? upstream.headers.connection.split(",") : [])
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
  for (const [name, value] of Object.entries(upstream.headers)) {
    if (
      value === undefined ||
      (contentLength !== undefined && name.toLowerCase() === "content-length") ||
      (stripContentEncoding && name.toLowerCase() === "content-encoding") ||
      BLOCKED_RESPONSE_HEADERS.has(name.toLowerCase()) ||
      connectionHeaders.has(name.toLowerCase())
    ) {
      continue;
    }
    headers[name] = value;
  }
  if (contentLength !== undefined && contentLength !== null) {
    headers["content-length"] = contentLength;
  }
  response.writeHead(upstream.statusCode ?? 502, upstream.statusMessage, headers);
}

function isSseResponse(response: http.IncomingMessage): boolean {
  return headerString(response.headers["content-type"])?.toLowerCase().includes("text/event-stream") ?? false;
}

function headerString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value.join(", ") : value;
}

function getUpstreamRequestId(headers: http.IncomingHttpHeaders): string | undefined {
  for (const name of ["x-request-id", "request-id", "openai-request-id", "x-codex-request-id"]) {
    const value = headerString(headers[name]);
    if (value && /^[A-Za-z0-9._:,-]{3,200}$/.test(value.trim())) {
      return value.trim();
    }
  }
  return undefined;
}

function formatSseFailureReason(failure: ResponsesSseFailure): string {
  const message = failure.message ? ` (${sanitizeLogText(failure.message)})` : "";
  return `SSE ${failure.type}${message}`;
}

function sanitizeLogText(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function isPotentialSseData(chunk: Buffer): boolean {
  const text = chunk.toString("utf8");
  return text.split(/\r?\n/).some((line) => {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith(":") || trimmed.startsWith("retry:")) {
      return false;
    }
    if (/^event:\s*(?:ping|keep-?alive|heartbeat)\s*$/i.test(trimmed)) {
      return false;
    }
    if (/^data:\s*(?:\[DONE\])?\s*$/i.test(trimmed)) {
      return false;
    }
    return true;
  });
}

function writeJson(response: http.ServerResponse, statusCode: number, payload: unknown): void {
  if (response.headersSent || response.destroyed) {
    return;
  }
  const body = Buffer.from(`${JSON.stringify(payload)}\n`, "utf8");
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": body.length,
  });
  response.end(body);
}

function sanitizeNetworkError(error: Error): string {
  const code = "code" in error && typeof (error as NodeJS.ErrnoException).code === "string"
    ? (error as NodeJS.ErrnoException).code
    : null;
  return code ? `network error (${code})` : "network error";
}
