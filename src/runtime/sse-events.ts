import { StringDecoder } from "node:string_decoder";

const FAILURE_TYPES = new Set([
  "response.failed",
  "response.incomplete",
  "error",
  "response.error",
]);

const HEARTBEAT_EVENTS = new Set(["ping", "keep-alive", "keepalive", "heartbeat"]);
const LIFECYCLE_EVENTS = new Set([
  "response.created",
  "response.in_progress",
  "response.queued",
]);

export type ResponsesUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
};

export type ResponsesSseFailure = {
  type: "response.failed" | "response.incomplete" | "error" | "response.error";
  message?: string;
  requestId?: string;
};

export type ResponsesSseInspection = {
  hasRealData: boolean;
  hasActivity: boolean;
  failures: ResponsesSseFailure[];
  requestId?: string;
  usage?: ResponsesUsage;
};

export type ResponsesSseState = {
  decoder: StringDecoder;
  buffer: string;
};

/**
 * Tracks an SSE response across arbitrary upstream chunk boundaries.
 */
export function createResponsesSseState(): ResponsesSseState {
  return { decoder: new StringDecoder("utf8"), buffer: "" };
}

/**
 * Classifies complete Responses SSE events without treating comments, empty
 * events, keep-alives, or [DONE] as useful model output.
 */
export function inspectResponsesSseChunk(
  state: ResponsesSseState,
  chunk: Buffer,
  flush = false
): ResponsesSseInspection {
  state.buffer += state.decoder.write(chunk);
  if (flush) {
    state.buffer += state.decoder.end();
  }

  const inspection: ResponsesSseInspection = { hasRealData: false, hasActivity: false, failures: [] };
  while (true) {
    const delimiter = /\r?\n\r?\n/.exec(state.buffer);
    if (!delimiter || delimiter.index === undefined) {
      break;
    }
    const block = state.buffer.slice(0, delimiter.index);
    state.buffer = state.buffer.slice(delimiter.index + delimiter[0].length);
    mergeInspection(inspection, inspectEventBlock(block));
  }

  if (flush && state.buffer.trim() !== "") {
    mergeInspection(inspection, inspectEventBlock(state.buffer));
    state.buffer = "";
  }

  return inspection;
}

function inspectEventBlock(block: string): ResponsesSseInspection {
  const lines = block.split(/\r?\n/);
  let eventName = "";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith(":")) {
      continue;
    }
    if (line.startsWith("event:")) {
      eventName = line.slice("event:".length).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      const value = line.slice("data:".length);
      dataLines.push(value.startsWith(" ") ? value.slice(1) : value);
    }
  }

  const data = dataLines.join("\n").trim();
  const normalizedEvent = eventName.toLowerCase();
  if (HEARTBEAT_EVENTS.has(normalizedEvent)) {
    return { hasRealData: false, hasActivity: true, failures: [] };
  }

  // A named failure event is actionable even when an upstream sends no data
  // payload. This is uncommon, but treating it as an empty heartbeat would
  // leave the request hanging until the stream timeout.
  if (FAILURE_TYPES.has(normalizedEvent) && data === "") {
    return {
      hasRealData: false,
      hasActivity: true,
      failures: [{ type: normalizedEvent as ResponsesSseFailure["type"] }],
    };
  }
  if (data === "[DONE]") {
    if (FAILURE_TYPES.has(normalizedEvent)) {
      return {
        hasRealData: false,
        hasActivity: true,
        failures: [{ type: normalizedEvent as ResponsesSseFailure["type"] }],
      };
    }
    return { hasRealData: false, hasActivity: true, failures: [] };
  }
  if (data === "") {
    return { hasRealData: false, hasActivity: false, failures: [] };
  }

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(data);
  } catch {
    if (FAILURE_TYPES.has(normalizedEvent)) {
      const requestId = extractRequestId(null, data);
      return {
        hasRealData: false,
        hasActivity: true,
        failures: [{
          type: normalizedEvent as ResponsesSseFailure["type"],
          message: data.slice(0, 240),
          ...(requestId ? { requestId } : {}),
        }],
        ...(requestId ? { requestId } : {}),
      };
    }
    if (LIFECYCLE_EVENTS.has(normalizedEvent)) {
      return { hasRealData: false, hasActivity: true, failures: [] };
    }
    // Non-JSON data is still real upstream output. It cannot carry a typed
    // Responses failure, but should prevent a false empty-stream retry.
    return { hasRealData: true, hasActivity: true, failures: [] };
  }

  const failureType = findFailureType(normalizedEvent, parsed);
  const requestId = extractRequestId(parsed, data);
  const usage = extractResponsesUsage(parsed);
  if (failureType) {
    const message = extractFailureMessage(parsed);
    return {
      hasRealData: false,
      hasActivity: true,
      failures: [{
        type: failureType,
        ...(message ? { message } : {}),
        ...(requestId ? { requestId } : {}),
      }],
      ...(requestId ? { requestId } : {}),
      ...(usage ? { usage } : {}),
    };
  }

  const eventType = responseEventType(normalizedEvent, parsed);
  const hasRealData = !LIFECYCLE_EVENTS.has(eventType) && hasProductivePayload(eventType, parsed);
  return {
    hasRealData,
    hasActivity: true,
    failures: [],
    ...(requestId ? { requestId } : {}),
    ...(usage ? { usage } : {}),
  };
}

function mergeInspection(target: ResponsesSseInspection, next: ResponsesSseInspection): void {
  target.hasRealData = target.hasRealData || next.hasRealData;
  target.hasActivity = target.hasActivity || next.hasActivity;
  target.failures.push(...next.failures);
  if (target.requestId === undefined && next.requestId !== undefined) {
    target.requestId = next.requestId;
  }
  if (!target.requestId) {
    const failureRequestId = next.failures.find((failure) => failure.requestId)?.requestId;
    if (failureRequestId !== undefined) {
      target.requestId = failureRequestId;
    }
  }
  if (next.usage) {
    target.usage = next.usage;
  }
}

function findFailureType(
  eventName: string,
  parsed: unknown
): ResponsesSseFailure["type"] | undefined {
  if (FAILURE_TYPES.has(eventName)) {
    return eventName as ResponsesSseFailure["type"];
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return undefined;
  }
  const type = (parsed as { type?: unknown }).type;
  if (typeof type === "string" && FAILURE_TYPES.has(type.toLowerCase())) {
    return type.toLowerCase() as ResponsesSseFailure["type"];
  }
  const response = objectField(parsed, "response") ?? parsed as Record<string, unknown>;
  const status = typeof response.status === "string" ? response.status.toLowerCase() : "";
  if (status === "incomplete") {
    return "response.incomplete";
  }
  if (status === "failed" || status === "cancelled") {
    return "response.failed";
  }
  if (response.error != null) {
    return "error";
  }
  if (eventName === "error" || eventName === "response.error") {
    return eventName as ResponsesSseFailure["type"];
  }
  if ("error" in parsed && (parsed as Record<string, unknown>).error != null) {
    return "error";
  }
  return undefined;
}

function extractFailureMessage(parsed: unknown): string | undefined {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return undefined;
  }
  const value = parsed as Record<string, unknown>;
  const response = objectField(value, "response");
  const error = objectField(value, "error") ?? objectField(response, "error");
  const incomplete = objectField(response, "incomplete_details");
  for (const candidate of [
    value.message,
    value.detail,
    response?.message,
    error?.message,
    incomplete?.reason,
  ]) {
    if (typeof candidate === "string" && candidate.trim() !== "") {
      return candidate.trim().slice(0, 240);
    }
  }
  return undefined;
}

function extractRequestId(parsed: unknown, rawData: string): string | undefined {
  const rawMatch = /request[_ ]?id\s*[:=]\s*["']?([A-Za-z0-9._:-]{3,200})/i.exec(rawData);
  if (rawMatch) {
    return rawMatch[1];
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return undefined;
  }
  const value = parsed as Record<string, unknown>;
  const response = objectField(value, "response");
  for (const candidate of [value.request_id, value.requestId, response?.request_id, response?.requestId]) {
    if (typeof candidate === "string" && /^[A-Za-z0-9._:-]{3,200}$/.test(candidate)) {
      return candidate;
    }
  }
  const error = objectField(value, "error") ?? objectField(response, "error");
  for (const candidate of [error?.request_id, error?.requestId]) {
    if (typeof candidate === "string" && /^[A-Za-z0-9._:-]{3,200}$/.test(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Extracts Responses token usage from either a top-level JSON response or an
 * SSE event envelope without exposing response content to logs.
 */
export function extractResponsesUsage(parsed: unknown): ResponsesUsage | undefined {
  if (!isObject(parsed)) {
    return undefined;
  }
  const response = objectField(parsed, "response");
  const usage = objectField(parsed, "usage") ?? objectField(response, "usage");
  if (!usage) {
    return undefined;
  }
  const inputTokens = tokenNumber(usage.input_tokens ?? usage.prompt_tokens);
  const outputTokens = tokenNumber(usage.output_tokens ?? usage.completion_tokens);
  const inputDetails = objectField(usage, "input_tokens_details") ?? objectField(usage, "prompt_tokens_details");
  const cachedInputTokens = tokenNumber(
    usage.cached_input_tokens ?? inputDetails?.cached_tokens ?? inputDetails?.cache_read_tokens
  );
  if (inputTokens === undefined && outputTokens === undefined && cachedInputTokens === undefined) {
    return undefined;
  }
  return {
    inputTokens: inputTokens ?? 0,
    cachedInputTokens: cachedInputTokens ?? 0,
    outputTokens: outputTokens ?? 0,
  };
}

/**
 * Inspects a buffered HTTP 2xx Responses JSON body for semantic failure and usage.
 */
export function inspectResponsesJsonBody(body: Buffer): ResponsesSseInspection | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString("utf8"));
  } catch {
    return null;
  }
  const failureType = findFailureType("", parsed);
  const requestId = extractRequestId(parsed, body.toString("utf8"));
  const usage = extractResponsesUsage(parsed);
  return {
    hasRealData: failureType === undefined,
    hasActivity: true,
    failures: failureType ? [{
      type: failureType,
      ...(extractFailureMessage(parsed) ? { message: extractFailureMessage(parsed) } : {}),
      ...(requestId ? { requestId } : {}),
    }] : [],
    ...(requestId ? { requestId } : {}),
    ...(usage ? { usage } : {}),
  };
}

function responseEventType(eventName: string, parsed: unknown): string {
  if (eventName) {
    return eventName;
  }
  if (!isObject(parsed) || typeof parsed.type !== "string") {
    return "";
  }
  return parsed.type.toLowerCase();
}

function hasProductivePayload(eventType: string, parsed: unknown): boolean {
  if (eventType) {
    return !HEARTBEAT_EVENTS.has(eventType);
  }
  if (!isObject(parsed)) {
    return true;
  }
  return ["delta", "text", "output", "item", "choices"].some((field) => field in parsed);
}

function objectField(value: unknown, field: string): Record<string, unknown> | null {
  if (!isObject(value)) {
    return null;
  }
  return isObject(value[field]) ? value[field] : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function tokenNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : undefined;
}
