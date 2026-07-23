import {
  ResponsesCompatibility,
} from "../domain/providers";
import {
  NamespaceName,
  transformNamespacedRequest,
} from "./namespace-transform";

const STRICT_TOP_LEVEL_FIELDS = ["prompt_cache_retention", "safety_identifier"];
const STRICT_RECURSIVE_FIELDS = ["external_web_access"];
const XAI_GROK_45_FIELDS = [
  "presence_penalty",
  "presencePenalty",
  "frequency_penalty",
  "frequencyPenalty",
  "stop",
];
const XAI_TOOL_TYPES = new Set([
  "function",
  "web_search",
  "x_search",
  "image_generation",
  "collections_search",
  "file_search",
  "code_execution",
  "code_interpreter",
  "mcp",
  "shell",
]);

/** Provider-specific request body and namespace response-restore metadata. */
export type ResponsesTransformResult = {
  body: Buffer;
  restoreMap: Map<string, NamespaceName>;
  changed: boolean;
};

/**
 * Applies the selected provider's strict Responses compatibility policy.
 */
export function prepareResponsesRequest(
  body: Buffer,
  contentType: string | undefined,
  compatibility: ResponsesCompatibility
): ResponsesTransformResult {
  if (compatibility === "native") {
    return { body, restoreMap: new Map(), changed: false };
  }

  const strict = transformJsonBody(body, contentType, sanitizeStrictPayload);
  const namespaced = transformNamespacedRequest(strict.body, contentType);
  if (compatibility !== "xai") {
    return {
      body: namespaced.body,
      restoreMap: namespaced.restoreMap,
      changed: strict.changed || namespaced.changed,
    };
  }

  const xai = transformJsonBody(namespaced.body, contentType, sanitizeXaiPayload);
  return {
    body: xai.body,
    restoreMap: namespaced.restoreMap,
    changed: strict.changed || namespaced.changed || xai.changed,
  };
}

function transformJsonBody(
  body: Buffer,
  contentType: string | undefined,
  transform: (payload: Record<string, any>) => boolean
): { body: Buffer; changed: boolean } {
  if (body.length === 0 || !isJsonContentType(contentType)) {
    return { body, changed: false };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(body.toString("utf8"));
  } catch {
    return { body, changed: false };
  }
  if (!isObject(payload) || !transform(payload)) {
    return { body, changed: false };
  }
  return { body: Buffer.from(JSON.stringify(payload), "utf8"), changed: true };
}

function sanitizeStrictPayload(payload: Record<string, any>): boolean {
  let changed = false;
  for (const field of STRICT_TOP_LEVEL_FIELDS) {
    changed = deleteField(payload, field) || changed;
  }
  for (const field of STRICT_RECURSIVE_FIELDS) {
    changed = deleteFieldRecursive(payload, field) || changed;
  }
  changed = promoteAdditionalTools(payload) || changed;
  changed = stripNullReasoningContent(payload) || changed;
  return changed;
}

function sanitizeXaiPayload(payload: Record<string, any>): boolean {
  let changed = false;
  if (targetsGrok45(payload.model)) {
    for (const field of XAI_GROK_45_FIELDS) {
      changed = deleteField(payload, field) || changed;
    }
  }
  changed = filterXaiTools(payload) || changed;
  return changed;
}

function deleteField(value: Record<string, any>, field: string): boolean {
  if (!(field in value)) {
    return false;
  }
  delete value[field];
  return true;
}

function deleteFieldRecursive(value: unknown, field: string): boolean {
  if (Array.isArray(value)) {
    let changed = false;
    for (const child of value) {
      changed = deleteFieldRecursive(child, field) || changed;
    }
    return changed;
  }
  if (!isObject(value)) {
    return false;
  }
  let changed = deleteField(value, field);
  for (const child of Object.values(value)) {
    changed = deleteFieldRecursive(child, field) || changed;
  }
  return changed;
}

function promoteAdditionalTools(payload: Record<string, any>): boolean {
  if (!Array.isArray(payload.input) || !payload.input.some(isAdditionalToolsCarrier)) {
    return false;
  }
  const tools = Array.isArray(payload.tools) ? [...payload.tools] : [];
  const seen = new Set(tools.map(toolDedupKey));
  const input: unknown[] = [];
  for (const item of payload.input) {
    if (!isAdditionalToolsCarrier(item)) {
      input.push(item);
      continue;
    }
    if (Array.isArray(item.tools)) {
      for (const tool of item.tools) {
        const key = toolDedupKey(tool);
        if (!seen.has(key)) {
          seen.add(key);
          tools.push(tool);
        }
      }
    }
  }
  payload.input = input;
  if (tools.length > 0) {
    payload.tools = tools;
  }
  return true;
}

function stripNullReasoningContent(payload: Record<string, any>): boolean {
  if (!Array.isArray(payload.input)) {
    return false;
  }
  let changed = false;
  for (const item of payload.input) {
    if (isObject(item) && item.type === "reasoning" && item.content === null) {
      delete item.content;
      changed = true;
    }
  }
  return changed;
}

function filterXaiTools(payload: Record<string, any>): boolean {
  if (!Array.isArray(payload.tools)) {
    return false;
  }
  const filtered = payload.tools.filter((tool: unknown) => {
    return isObject(tool) && typeof tool.type === "string" && XAI_TOOL_TYPES.has(tool.type.trim());
  });
  let changed = filtered.length !== payload.tools.length;
  if (changed) {
    if (filtered.length === 0) {
      delete payload.tools;
    } else {
      payload.tools = filtered;
    }
  }
  if (payload.tool_choice !== undefined && shouldDropToolChoice(payload.tool_choice, filtered)) {
    delete payload.tool_choice;
    changed = true;
  }
  return changed;
}

function shouldDropToolChoice(choice: unknown, tools: unknown[]): boolean {
  if (tools.length === 0) {
    return true;
  }
  if (!isObject(choice)) {
    return false;
  }
  const type = typeof choice.type === "string" ? choice.type.trim() : "";
  if (!type) {
    return false;
  }
  if (!XAI_TOOL_TYPES.has(type)) {
    return true;
  }
  if (type !== "function") {
    return false;
  }
  const name = readToolName(choice);
  return Boolean(name && !tools.some((tool) => isObject(tool) && tool.type === "function" && readToolName(tool) === name));
}

function readToolName(tool: Record<string, any>): string | null {
  if (typeof tool.name === "string" && tool.name.trim()) {
    return tool.name.trim();
  }
  if (isObject(tool.function) && typeof tool.function.name === "string" && tool.function.name.trim()) {
    return tool.function.name.trim();
  }
  return null;
}

function toolDedupKey(tool: unknown): string {
  if (isObject(tool)) {
    const type = typeof tool.type === "string" ? tool.type.trim() : "";
    const name = readToolName(tool);
    if (type && name) {
      return `type:${type}\u0000name:${name}`;
    }
    if (type === "mcp" && typeof tool.server_label === "string" && tool.server_label.trim()) {
      return `type:mcp\u0000server_label:${tool.server_label.trim()}`;
    }
  }
  return `json:${JSON.stringify(tool)}`;
}

function isAdditionalToolsCarrier(value: unknown): value is Record<string, any> {
  return isObject(value) && value.type === "additional_tools";
}

function targetsGrok45(model: unknown): boolean {
  if (typeof model !== "string") {
    return false;
  }
  return model.trim().split("/").pop()?.trim().toLowerCase() === "grok-4.5";
}

function isJsonContentType(contentType: string | undefined): boolean {
  return Boolean(contentType && /(?:application\/json|\+json)(?:;|$)/i.test(contentType));
}

function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
