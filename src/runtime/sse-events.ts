import { StringDecoder } from "node:string_decoder";

const FAILURE_TYPES = new Set([
  "response.failed",
  "response.incomplete",
  "error",
  "response.error",
]);

const HEARTBEAT_EVENTS = new Set(["ping", "keep-alive", "keepalive", "heartbeat"]);

export type ResponsesSseFailure = {
  type: "response.failed" | "response.incomplete" | "error" | "response.error";
  message?: string;
  requestId?: string;
};

export type ResponsesSseInspection = {
  hasRealData: boolean;
  failures: ResponsesSseFailure[];
  requestId?: string;
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

  const inspection: ResponsesSseInspection = { hasRealData: false, failures: [] };
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
  if (HEARTBEAT_EVENTS.has(normalizedEvent) || data === "[DONE]") {
    return { hasRealData: false, failures: [] };
  }

  // A named failure event is actionable even when an upstream sends no data
  // payload. This is uncommon, but treating it as an empty heartbeat would
  // leave the request hanging until the stream timeout.
  if (FAILURE_TYPES.has(normalizedEvent) && data === "") {
    return { hasRealData: false, failures: [{ type: normalizedEvent as ResponsesSseFailure["type"] }] };
  }
  if (data === "") {
    return { hasRealData: false, failures: [] };
  }

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(data);
  } catch {
    // Non-JSON data is still real upstream output. It cannot carry a typed
    // Responses failure, but should prevent a false empty-stream retry.
  }

  const failureType = findFailureType(normalizedEvent, parsed);
  const requestId = extractRequestId(parsed, data);
  if (failureType) {
    const message = extractFailureMessage(parsed);
    return {
      hasRealData: false,
      failures: [{
        type: failureType,
        ...(message ? { message } : {}),
        ...(requestId ? { requestId } : {}),
      }],
      ...(requestId ? { requestId } : {}),
    };
  }

  return { hasRealData: true, failures: [], requestId };
}

function mergeInspection(target: ResponsesSseInspection, next: ResponsesSseInspection): void {
  target.hasRealData = target.hasRealData || next.hasRealData;
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
  const error = value.error && typeof value.error === "object" && !Array.isArray(value.error)
    ? value.error as Record<string, unknown>
    : null;
  for (const candidate of [value.message, value.detail, error?.message]) {
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
  for (const candidate of [value.request_id, value.requestId]) {
    if (typeof candidate === "string" && /^[A-Za-z0-9._:-]{3,200}$/.test(candidate)) {
      return candidate;
    }
  }
  const error = value.error && typeof value.error === "object" && !Array.isArray(value.error)
    ? value.error as Record<string, unknown>
    : null;
  for (const candidate of [error?.request_id, error?.requestId]) {
    if (typeof candidate === "string" && /^[A-Za-z0-9._:-]{3,200}$/.test(candidate)) {
      return candidate;
    }
  }
  return undefined;
}
