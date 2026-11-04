import type { Generate, GenerateRequest } from "./tasks";

/**
 * Server-only: System Two through any OpenAI-compatible Chat Completions
 * endpoint — OpenAI itself, Gemini's compatibility endpoint, OpenRouter, and
 * local servers such as Ollama and LM Studio. Plain fetch, no SDK: these are
 * the providers' own HTTP APIs, called with the person's own key (or none,
 * for a model on this machine). Claude is never called this way; it has its
 * own adapter on the official SDK (claude.ts).
 */
export interface CompatibleOptions {
  /** Human name for messages, e.g. "OpenAI". */
  name: string;
  baseUrl: string;
  apiKey?: string;
  model: string;
  /** Whether the endpoint enforces `response_format: json_schema`. Otherwise the schema is spelled out in the prompt. */
  jsonSchema: boolean;
  headers?: Record<string, string>;
  /** Provider-specific request fields (e.g. OpenRouter's routing preferences). */
  extraBody?: Record<string, unknown>;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface ChatResponse {
  model?: string;
  choices?: { finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }[];
  error?: { message?: string } | string;
}

export const schemaInstruction = (schema: Record<string, unknown>) =>
  `\n\nReply with only a JSON object that matches this JSON Schema, with no other text:\n${JSON.stringify(schema)}`;

function describeStatus(name: string, status: number, model: string): string {
  if (status === 401 || status === 403) return `${name} rejected the key. Check it, then restart FocusDeck.`;
  if (status === 404) return `${name} doesn't know the model "${model}". Set a model you have access to.`;
  if (status === 429) return `${name} is rate limiting or out of quota. Try again later.`;
  return `${name} returned an error (${status}).`;
}

export function openAICompatibleGenerator(options: CompatibleOptions): Generate {
  const { name, baseUrl, apiKey, model, jsonSchema, headers = {}, extraBody = {}, timeoutMs = 60_000, fetchImpl = fetch } = options;
  const send = (body: Record<string, unknown>) =>
    fetchImpl(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}), ...headers },
      body: JSON.stringify({ ...extraBody, ...body }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  const request = (system: string, prompt: string, schema: Record<string, unknown> | undefined, enforce: boolean) => ({
    model,
    messages: [
      { role: "system", content: schema && !enforce ? system + schemaInstruction(schema) : system },
      { role: "user", content: prompt },
    ],
    ...(schema && enforce ? { response_format: { type: "json_schema", json_schema: { name: "focusdeck_answer", strict: true, schema } } } : {}),
  });
  return async ({ system, prompt, schema }: GenerateRequest) => {
    let response: Response;
    try {
      response = await send(request(system, prompt, schema, jsonSchema));
      // Some compatible servers don't take json_schema: ask again with the schema spelled out, and validate locally.
      if (response.status === 400 && schema && jsonSchema) response = await send(request(system, prompt, schema, false));
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      return { ok: false, reason: timedOut ? `${name} took too long to answer.` : `Couldn't reach ${name} at ${baseUrl}.` };
    }
    if (!response.ok) return { ok: false, reason: describeStatus(name, response.status, model) };
    let data: ChatResponse;
    try {
      data = (await response.json()) as ChatResponse;
    } catch {
      return { ok: false, reason: `${name} sent back something that wasn't JSON.` };
    }
    const choice = data.choices?.[0];
    if (choice?.message?.refusal) return { ok: false, reason: "System Two declined this request, so the template is shown instead." };
    if (choice?.finish_reason === "length") return { ok: false, reason: "System Two ran out of room before finishing." };
    const text = (choice?.message?.content ?? "").trim();
    return text ? { ok: true, text, model: data.model || model } : { ok: false, reason: `${name} returned nothing.` };
  };
}

/** List a local server's models (Ollama, LM Studio): a cheap reachability check with no tokens spent. */
export async function listModels(baseUrl: string, fetchImpl: typeof fetch = fetch, timeoutMs = 1500): Promise<string[] | null> {
  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}/models`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return null;
    const data = (await response.json()) as { data?: { id?: unknown }[] };
    return (data.data ?? []).flatMap((m) => (typeof m.id === "string" ? [m.id] : []));
  } catch {
    return null;
  }
}
