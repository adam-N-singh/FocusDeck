/**
 * Which AI may run System Two, in plain words — shared by the server
 * (adapters.ts) and the page (the picker in Declare, the disclosure in What
 * it sees). No secrets live here: API keys stay in the server's environment,
 * and subscription logins stay inside each provider's own official CLI.
 */
export const PROVIDER_IDS = [
  "anthropic", "claude-cli",
  "openai", "codex-cli",
  "gemini", "gemini-cli",
  "openrouter", "ollama", "lmstudio", "openai-compatible",
] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const DEFAULT_PROVIDER: ProviderId = "anthropic";

export type ProviderAccess = "subscription" | "api-key" | "local";

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  access: ProviderAccess;
  /** What pays for it. */
  billing: string;
  /** Where the aggregates go when it runs. */
  destination: string;
  /** Environment variables the server reads (names only). */
  env: string[];
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: "claude-cli", label: "Claude — your Claude plan, through Claude Code", access: "subscription",
    billing: "Your Claude Pro or Max plan's usage, via your own Claude Code login.",
    destination: "Anthropic, through the Claude Code CLI on this machine.",
    env: ["FOCUSDECK_CLAUDE_CLI_MODEL", "FOCUSDECK_CLAUDE_CLI_PATH"],
  },
  {
    id: "codex-cli", label: "ChatGPT — your ChatGPT plan, through Codex CLI", access: "subscription",
    billing: "Your ChatGPT plan's Codex usage, via your own Codex CLI sign-in.",
    destination: "OpenAI, through the Codex CLI on this machine.",
    env: ["FOCUSDECK_CODEX_CLI_MODEL", "FOCUSDECK_CODEX_CLI_PATH"],
  },
  {
    id: "gemini-cli", label: "Gemini — your Google account, through Gemini CLI", access: "subscription",
    billing: "Your Google account's Gemini CLI quota (free tier, or your Google AI plan).",
    destination: "Google, through the Gemini CLI on this machine.",
    env: ["FOCUSDECK_GEMINI_CLI_MODEL", "FOCUSDECK_GEMINI_CLI_PATH"],
  },
  {
    id: "anthropic", label: "Claude — Anthropic API key", access: "api-key",
    billing: "Anthropic API usage on your key (separate from a Claude plan).",
    destination: "Anthropic's API.",
    env: ["ANTHROPIC_API_KEY", "FOCUSDECK_SYSTEM_TWO_MODEL"],
  },
  {
    id: "openai", label: "OpenAI — API key", access: "api-key",
    billing: "OpenAI API usage on your key (separate from a ChatGPT plan).",
    destination: "OpenAI's API.",
    env: ["OPENAI_API_KEY", "FOCUSDECK_OPENAI_MODEL"],
  },
  {
    id: "gemini", label: "Gemini — API key", access: "api-key",
    billing: "Gemini API usage on your key (Google AI Studio).",
    destination: "Google's Gemini API.",
    env: ["GEMINI_API_KEY", "FOCUSDECK_GEMINI_MODEL"],
  },
  {
    id: "openrouter", label: "OpenRouter — API key", access: "api-key",
    billing: "OpenRouter credits on your key.",
    destination: "OpenRouter, which forwards to the model you choose.",
    env: ["OPENROUTER_API_KEY", "FOCUSDECK_OPENROUTER_MODEL"],
  },
  {
    id: "ollama", label: "Ollama — a model on this machine", access: "local",
    billing: "Nothing: it runs on your hardware.",
    destination: "Nowhere: Ollama on this machine.",
    env: ["FOCUSDECK_OLLAMA_MODEL", "FOCUSDECK_OLLAMA_URL"],
  },
  {
    id: "lmstudio", label: "LM Studio — a model on this machine", access: "local",
    billing: "Nothing: it runs on your hardware.",
    destination: "Nowhere: LM Studio's local server.",
    env: ["FOCUSDECK_LMSTUDIO_MODEL", "FOCUSDECK_LMSTUDIO_URL"],
  },
  {
    id: "openai-compatible", label: "Any OpenAI-compatible endpoint", access: "api-key",
    billing: "Whatever that endpoint charges.",
    destination: "The endpoint you configure.",
    env: ["FOCUSDECK_OPENAI_COMPAT_BASE_URL", "FOCUSDECK_OPENAI_COMPAT_API_KEY", "FOCUSDECK_OPENAI_COMPAT_MODEL"],
  },
];

export const isProviderId = (value: unknown): value is ProviderId =>
  typeof value === "string" && (PROVIDER_IDS as readonly string[]).includes(value);

export const providerInfo = (id: ProviderId): ProviderInfo => PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];
