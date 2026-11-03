import { SYSTEM_TWO_MODEL, anthropicGenerator, credentialsHint } from "./claude";
import { CLI_SPECS, cliGenerator, isCliProvider } from "./cli";
import { listModels, openAICompatibleGenerator } from "./openaiCompatible";
import { findOnPath, type Env } from "./process";
import type { ProviderId } from "./providerCatalog";
import type { Generate } from "./tasks";

/**
 * Server-only: turns the provider you chose into a `Generate` function, and
 * reports which providers are set up — without spending a token. Keys are
 * read from the server's environment here and nowhere else; the page only
 * ever learns *whether* one is set.
 */
export interface ProviderStatus {
  id: ProviderId;
  ready: boolean;
  detail: string;
  model: string | null;
}

type CompatId = "openai" | "gemini" | "openrouter" | "ollama" | "lmstudio" | "openai-compatible";

interface CompatSpec {
  name: string;
  baseUrl: (env: Env) => string;
  keyEnv?: string;
  modelEnv: string;
  defaultModel?: string;
  jsonSchema: boolean;
  local?: boolean;
  headers?: Record<string, string>;
  extraBody?: Record<string, unknown>;
}

// Default model ids are the providers' own documented ids (BUILD-NOTES.md); each can be overridden.
export const COMPAT: Record<CompatId, CompatSpec> = {
  openai: { name: "OpenAI", baseUrl: () => "https://api.openai.com/v1", keyEnv: "OPENAI_API_KEY", modelEnv: "FOCUSDECK_OPENAI_MODEL", defaultModel: "gpt-5.5", jsonSchema: true },
  gemini: { name: "Gemini", baseUrl: () => "https://generativelanguage.googleapis.com/v1beta/openai", keyEnv: "GEMINI_API_KEY", modelEnv: "FOCUSDECK_GEMINI_MODEL", defaultModel: "gemini-3.8-flash", jsonSchema: true },
  // require_parameters: only route to providers that honour the JSON schema.
  openrouter: { name: "OpenRouter", baseUrl: () => "https://openrouter.ai/api/v1", keyEnv: "OPENROUTER_API_KEY", modelEnv: "FOCUSDECK_OPENROUTER_MODEL", defaultModel: "openai/gpt-5.2", jsonSchema: true, headers: { "X-Title": "FocusDeck" }, extraBody: { provider: { require_parameters: true } } },
  ollama: { name: "Ollama", baseUrl: (env) => env.FOCUSDECK_OLLAMA_URL || "http://127.0.0.1:11434/v1", modelEnv: "FOCUSDECK_OLLAMA_MODEL", defaultModel: "gpt-oss:20b", jsonSchema: true, local: true },
  lmstudio: { name: "LM Studio", baseUrl: (env) => env.FOCUSDECK_LMSTUDIO_URL || "http://127.0.0.1:1234/v1", modelEnv: "FOCUSDECK_LMSTUDIO_MODEL", jsonSchema: true, local: true },
  "openai-compatible": { name: "Your endpoint", baseUrl: (env) => env.FOCUSDECK_OPENAI_COMPAT_BASE_URL || "", keyEnv: "FOCUSDECK_OPENAI_COMPAT_API_KEY", modelEnv: "FOCUSDECK_OPENAI_COMPAT_MODEL", jsonSchema: false },
};

async function compatStatus(id: CompatId, env: Env, fetchImpl: typeof fetch): Promise<ProviderStatus> {
  const spec = COMPAT[id];
  const model = env[spec.modelEnv] || spec.defaultModel || null;
  if (spec.local) {
    const models = await listModels(spec.baseUrl(env), fetchImpl);
    if (models === null) return { id, ready: false, detail: `${spec.name} isn't answering at ${spec.baseUrl(env)}. Start it, or set ${id === "ollama" ? "FOCUSDECK_OLLAMA_URL" : "FOCUSDECK_LMSTUDIO_URL"}.`, model };
    // Your setting first, then the documented default if you have it, then whatever you do have.
    const chosen = env[spec.modelEnv] || (spec.defaultModel && models.includes(spec.defaultModel) ? spec.defaultModel : models[0]) || null;
    if (!chosen) return { id, ready: false, detail: `${spec.name} is running but has no models yet.`, model: null };
    return { id, ready: true, detail: `${spec.name} is running with ${models.length} model${models.length === 1 ? "" : "s"}.`, model: chosen };
  }
  if (id === "openai-compatible" && !spec.baseUrl(env)) return { id, ready: false, detail: "Set FOCUSDECK_OPENAI_COMPAT_BASE_URL (and a model) to use your own endpoint.", model };
  if (spec.keyEnv && !env[spec.keyEnv] && id !== "openai-compatible") return { id, ready: false, detail: `Set ${spec.keyEnv} in the environment FocusDeck's server runs in.`, model };
  if (!model) return { id, ready: false, detail: `Set ${spec.modelEnv} to the model to use.`, model: null };
  return { id, ready: true, detail: spec.keyEnv && env[spec.keyEnv] ? `Key found in ${spec.keyEnv}.` : "Endpoint configured.", model };
}

export async function providerStatus(id: ProviderId, env: Env = process.env, fetchImpl: typeof fetch = fetch): Promise<ProviderStatus> {
  if (id === "anthropic") {
    return credentialsHint()
      ? { id, ready: true, detail: "Anthropic credentials found on the server.", model: SYSTEM_TWO_MODEL }
      : { id, ready: false, detail: "Set ANTHROPIC_API_KEY (or sign in with `ant auth login`) where FocusDeck's server runs.", model: SYSTEM_TWO_MODEL };
  }
  if (isCliProvider(id)) {
    const spec = CLI_SPECS[id];
    const found = await findOnPath(env[spec.pathEnv] || spec.command, env);
    const model = env[spec.modelEnv] || null;
    return found
      ? { id, ready: true, detail: `Found ${spec.command} at ${found}. It runs signed in as you; press Test to check the sign-in.`, model }
      : { id, ready: false, detail: `${spec.product} isn't on this machine's PATH. ${spec.install}`, model };
  }
  return compatStatus(id, env, fetchImpl);
}

export async function generatorFor(id: ProviderId, env: Env = process.env, fetchImpl: typeof fetch = fetch): Promise<Generate | { error: string }> {
  if (id === "anthropic") return anthropicGenerator();
  if (isCliProvider(id)) {
    const spec = CLI_SPECS[id];
    const file = await findOnPath(env[spec.pathEnv] || spec.command, env);
    return file ? cliGenerator(id, { file, model: env[spec.modelEnv] || undefined, env }) : { error: `${spec.product} isn't installed here. ${spec.install}` };
  }
  const status = await compatStatus(id, env, fetchImpl);
  if (!status.ready || !status.model) return { error: status.detail };
  const spec = COMPAT[id];
  return openAICompatibleGenerator({
    name: spec.name, baseUrl: spec.baseUrl(env), apiKey: spec.keyEnv ? env[spec.keyEnv] : undefined, model: status.model, jsonSchema: spec.jsonSchema,
    headers: spec.headers, extraBody: spec.extraBody, fetchImpl,
  });
}
