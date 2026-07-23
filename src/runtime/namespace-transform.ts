import { createHash } from "node:crypto";
import { StringDecoder } from "node:string_decoder";

const MAX_TOOL_NAME_BYTES = 64;

export type NamespaceName = {
  namespace: string;
  name: string;
};

export type NamespaceTransformResult = {
  body: Buffer;
  restoreMap: Map<string, NamespaceName>;
};

export type NamespaceSseState = {
  decoder: StringDecoder;
  buffer: string;
};

/**
 * Flattens a Codex namespace/function pair using the same bounded naming shape
 * used by compatible Responses gateways.
 */
export function flattenNamespaceToolName(namespace: string, name: string): string {
  const fullName = `${namespace}__${name}`;
  if (Buffer.byteLength(fullName, "utf8") <= MAX_TOOL_NAME_BYTES) {
    return fullName;
  }

  const hash = createHash("sha256").update(fullName, "utf8").digest("hex").slice(0, 8);
  const suffix = `__${hash}`;
  const prefixBytes = MAX_TOOL_NAME_BYTES - Buffer.byteLength(suffix, "utf8");
  let prefix = "";
  for (const character of fullName) {
    if (Buffer.byteLength(prefix + character, "utf8") > prefixBytes) {
      break;
    }
    prefix += character;
  }
  return `${prefix}${suffix}`;
}

/**
 * Converts Codex namespace tools into the flat function shape accepted by
 * older OpenAI-compatible Responses gateways.
 */
export function transformNamespacedRequest(body: Buffer, contentType?: string): NamespaceTransformResult {
  if (body.length === 0 || !isJsonContentType(contentType)) {
    return { body, restoreMap: new Map() };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body.toString("utf8"));
  } catch {
    return { body, restoreMap: new Map() };
  }
  if (!isObject(payload)) {
    return { body, restoreMap: new Map() };
  }

  const tools = Array.isArray(payload.tools) ? payload.tools : [];
  const namespaceTools = tools.filter((tool) => isObject(tool) && tool.type === "namespace");
  const restoreMap = new Map<string, NamespaceName>();
  if (namespaceTools.length > 0) {
    const occupied = new Set<string>();
    for (const tool of tools) {
      if (isObject(tool) && (tool.type === "function" || tool.type === "custom")) {
        const name = readToolName(tool);
        if (name) {
          occupied.add(name);
        }
      }
    }

    for (const tool of namespaceTools) {
      const namespace = typeof tool.name === "string" ? tool.name.trim() : "";
      if (!namespace) {
        continue;
      }
      for (const child of namespaceChildren(tool)) {
        if (!isObject(child) || (child.type !== "function" && child.type !== "custom")) {
          continue;
        }
        const name = readToolName(child);
        if (!name) {
          continue;
        }
        const flatName = flattenNamespaceToolName(namespace, name);
        const previous = restoreMap.get(flatName);
        if (occupied.has(flatName) || (previous && (previous.namespace !== namespace || previous.name !== name))) {
          throw new Error(`Namespace tool collision: ${namespace}/${name} maps to ${flatName}.`);
        }
        restoreMap.set(flatName, { namespace, name });
      }
    }

    payload.tools = tools.flatMap((tool) => {
      if (!isObject(tool) || tool.type !== "namespace") {
        return [tool];
      }
      const namespace = typeof tool.name === "string" ? tool.name.trim() : "";
      if (!namespace) {
        return [];
      }
      return namespaceChildren(tool).flatMap((child) => {
        if (!isObject(child) || (child.type !== "function" && child.type !== "custom")) {
          return [];
        }
        const name = readToolName(child);
        if (!name) {
          return [];
        }
        const flatName = flattenNamespaceToolName(namespace, name);
        return [writeToolName(child, flatName)];
      });
    });

    if (isObject(payload.tool_choice)) {
      if (payload.tool_choice.type === "namespace") {
        payload.tool_choice = "auto";
      } else {
        rewriteNamespacedCall(payload.tool_choice, restoreMap);
      }
    }
  }

  if (payload.input !== undefined) {
    rewriteInputItems(payload.input, restoreMap);
  }

  return {
    body: Buffer.from(JSON.stringify(payload), "utf8"),
    restoreMap,
  };
}

/**
 * Restores namespaced function/custom tool calls in a buffered Responses body.
 */
export function restoreNamespacedResponse(body: Buffer, restoreMap: Map<string, NamespaceName>): Buffer {
  if (body.length === 0 || restoreMap.size === 0) {
    return body;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(body.toString("utf8"));
  } catch {
    return body;
  }
  if (!restoreValue(payload, restoreMap)) {
    return body;
  }
  return Buffer.from(JSON.stringify(payload), "utf8");
}

/**
 * Creates state for incremental SSE namespace restoration.
 */
export function createNamespaceSseState(): NamespaceSseState {
  return { decoder: new StringDecoder("utf8"), buffer: "" };
}

/**
 * Restores namespaced calls in complete SSE blocks while tolerating arbitrary
 * upstream chunk boundaries.
 */
export function restoreNamespacedSseChunk(
  state: NamespaceSseState,
  chunk: Buffer,
  restoreMap: Map<string, NamespaceName>,
  flush = false
): Buffer {
  if (restoreMap.size === 0) {
    return chunk;
  }
  state.buffer += state.decoder.write(chunk);
  if (flush) {
    state.buffer += state.decoder.end();
  }

  let output = "";
  while (true) {
    const delimiter = /\r?\n\r?\n/.exec(state.buffer);
    if (!delimiter || delimiter.index === undefined) {
      break;
    }
    const block = state.buffer.slice(0, delimiter.index);
    state.buffer = state.buffer.slice(delimiter.index + delimiter[0].length);
    output += restoreSseBlock(block, restoreMap);
  }

  if (flush && state.buffer.trim() !== "") {
    output += restoreSseBlock(state.buffer, restoreMap);
    state.buffer = "";
  }
  return Buffer.from(output, "utf8");
}

function rewriteInputItems(value: unknown, restoreMap: Map<string, NamespaceName>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      rewriteInputItems(item, restoreMap);
    }
    return;
  }
  if (!isObject(value)) {
    return;
  }
  if (value.type === "function_call") {
    rewriteNamespacedCall(value, restoreMap);
  } else if (value.type === "custom_tool_call" && typeof value.namespace === "string") {
    // Some Codex custom tools carry namespace metadata even though their name is
    // already globally unique. Strict gateways reject the metadata field.
    delete value.namespace;
  }
  for (const child of Object.values(value)) {
    rewriteInputItems(child, restoreMap);
  }
}

function rewriteNamespacedCall(value: Record<string, unknown>, restoreMap: Map<string, NamespaceName>): void {
  const namespace = typeof value.namespace === "string" ? value.namespace.trim() : "";
  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (!namespace || !name) {
    return;
  }
  const flatName = flattenNamespaceToolName(namespace, name);
  if (restoreMap.has(flatName)) {
    value.name = flatName;
  }
  delete value.namespace;
}

function restoreValue(value: unknown, restoreMap: Map<string, NamespaceName>): boolean {
  let changed = false;
  if (Array.isArray(value)) {
    for (const item of value) {
      changed = restoreValue(item, restoreMap) || changed;
    }
    return changed;
  }
  if (!isObject(value)) {
    return false;
  }
  if (value.type === "function_call" || value.type === "custom_tool_call") {
    const name = typeof value.name === "string" ? value.name : "";
    const original = restoreMap.get(name);
    if (original) {
      value.name = original.name;
      value.namespace = original.namespace;
      changed = true;
    }
  }
  for (const child of Object.values(value)) {
    changed = restoreValue(child, restoreMap) || changed;
  }
  return changed;
}

function restoreSseBlock(block: string, restoreMap: Map<string, NamespaceName>): string {
  const lines = block.split(/\r?\n/);
  const dataIndexes: number[] = [];
  const dataParts: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^data:\s?(.*)$/.exec(lines[index]);
    if (match) {
      dataIndexes.push(index);
      dataParts.push(match[1]);
    }
  }
  if (dataIndexes.length === 0 || dataParts.join("\n").trim() === "[DONE]") {
    return `${block}\n\n`;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(dataParts.join("\n"));
  } catch {
    return `${block}\n\n`;
  }
  const before = JSON.stringify(payload);
  restoreValue(payload, restoreMap);
  const restored = JSON.stringify(payload);
  if (before === restored) {
    return `${block}\n\n`;
  }
  const firstData = dataIndexes[0];
  const output = lines.filter((_line, index) => !dataIndexes.includes(index));
  output.splice(firstData, 0, `data: ${restored}`);
  return `${output.join("\n")}\n\n`;
}

function namespaceChildren(tool: Record<string, unknown>): unknown[] {
  if (Array.isArray(tool.tools)) {
    return tool.tools;
  }
  if (Array.isArray(tool.children)) {
    return tool.children;
  }
  return [];
}

function readToolName(tool: Record<string, unknown>): string | null {
  if (typeof tool.name === "string" && tool.name.trim()) {
    return tool.name.trim();
  }
  if (isObject(tool.function) && typeof tool.function.name === "string" && tool.function.name.trim()) {
    return tool.function.name.trim();
  }
  return null;
}

function writeToolName(tool: Record<string, unknown>, name: string): Record<string, unknown> {
  const next: Record<string, unknown> = { ...tool, name };
  if (isObject(tool.function)) {
    next.function = { ...tool.function, name };
  }
  return next;
}

function isJsonContentType(contentType: string | undefined): boolean {
  return Boolean(contentType && /(?:application\/json|\+json)(?:;|$)/i.test(contentType));
}

function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
