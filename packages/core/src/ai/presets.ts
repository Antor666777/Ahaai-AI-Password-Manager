export type ProviderKind =
  | "openai"
  | "anthropic"
  | "google"
  | "openai-compatible"
  | "azure"
  | "groq"
  | "mistral"
  | "gateway";

/**
 * What a provider is for. Language models generate text; evaluation models
 * answer typed questions about one shared state. A search picks whichever the
 * request can use, and the two never stand in for each other.
 */
export type ProviderCapability = "language" | "evaluation";

export interface ProviderPreset {
  id: string;
  label: string;
  kind: ProviderKind;
  /** Default base URL (mainly for OpenAI-compatible and local runtimes). */
  baseUrl?: string;
  defaultModels: string[];
  isLocal: boolean;
  /** A key must be supplied before this provider can be used. */
  requiresKey: boolean;
  /**
   * The key is not required, but the endpoint may still expect one, so the
   * field is offered. Custom endpoints cover both kinds: a local box with no
   * auth, and a hosted gateway that rejects anything unauthenticated.
   */
  keyOptional: boolean;
  /** Env var used as a fallback credential for self-hosted installs. */
  envKey?: string;
  /** Defaults to `language` when omitted. */
  capability?: ProviderCapability;
}


export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "openai",
    label: "OpenAI",
    kind: "openai",
    defaultModels: ["gpt-4o", "gpt-4o-mini"],
    isLocal: false,
    requiresKey: true,
    keyOptional: false,
    envKey: "OPENAI_API_KEY",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    kind: "anthropic",
    defaultModels: ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest"],
    isLocal: false,
    requiresKey: true,
    keyOptional: false,
    envKey: "ANTHROPIC_API_KEY",
  },
  {
    id: "google",
    label: "Google Gemini",
    kind: "google",
    defaultModels: ["gemini-2.0-flash", "gemini-1.5-pro"],
    isLocal: false,
    requiresKey: true,
    keyOptional: false,
    envKey: "GOOGLE_GENERATIVE_AI_API_KEY",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    kind: "openai-compatible",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModels: ["openai/gpt-4o-mini", "anthropic/claude-3.5-sonnet"],
    isLocal: false,
    requiresKey: true,
    keyOptional: false,
    envKey: "OPENROUTER_API_KEY",
  },
  {
    id: "groq",
    label: "Groq",
    kind: "groq",
    defaultModels: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
    isLocal: false,
    requiresKey: true,
    keyOptional: false,
    envKey: "GROQ_API_KEY",
  },
  {
    id: "mistral",
    label: "Mistral",
    kind: "mistral",
    defaultModels: ["mistral-large-latest", "mistral-small-latest"],
    isLocal: false,
    requiresKey: true,
    keyOptional: false,
    envKey: "MISTRAL_API_KEY",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    kind: "openai-compatible",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModels: ["deepseek-chat", "deepseek-reasoner"],
    isLocal: false,
    requiresKey: true,
    keyOptional: false,
    envKey: "DEEPSEEK_API_KEY",
  },
  {
    id: "xai",
    label: "xAI",
    kind: "openai-compatible",
    baseUrl: "https://api.x.ai/v1",
    defaultModels: ["grok-2-latest", "grok-2-mini"],
    isLocal: false,
    requiresKey: true,
    keyOptional: false,
    envKey: "XAI_API_KEY",
  },
  {
    id: "azure",
    label: "Azure OpenAI",
    kind: "azure",
    defaultModels: [],
    isLocal: false,
    requiresKey: true,
    keyOptional: false,
    envKey: "AZURE_API_KEY",
  },
  {
    id: "vercel-gateway",
    label: "Vercel AI Gateway (decision model)",
    kind: "gateway",
    defaultModels: ["typesafe-ai/jev"],
    isLocal: false,
    requiresKey: true,
    keyOptional: false,
    envKey: "AI_GATEWAY_API_KEY",
    capability: "evaluation",
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    kind: "openai-compatible",
    baseUrl: "http://localhost:11434/v1",
    defaultModels: ["llama3.2", "qwen2.5"],
    isLocal: true,
    requiresKey: false,
    keyOptional: false,
  },
  {
    id: "lmstudio",
    label: "LM Studio (local)",
    kind: "openai-compatible",
    baseUrl: "http://localhost:1234/v1",
    defaultModels: ["local-model"],
    isLocal: true,
    requiresKey: false,
    keyOptional: false,
  },
  {
    id: "vllm",
    label: "vLLM (local)",
    kind: "openai-compatible",
    baseUrl: "http://localhost:8000/v1",
    defaultModels: [],
    isLocal: true,
    requiresKey: false,
    keyOptional: false,
  },
  {
    id: "custom-openai",
    label: "Custom OpenAI-compatible endpoint",
    kind: "openai-compatible",
    defaultModels: [],
    isLocal: false,
    requiresKey: false,
    keyOptional: true,
  },
];

const PRESETS_BY_ID = new Map(PROVIDER_PRESETS.map((preset) => [preset.id, preset]));

export function getPreset(id: string): ProviderPreset | undefined {
  return PRESETS_BY_ID.get(id);
}

export function listPresets(): ProviderPreset[] {
  return PROVIDER_PRESETS;
}

/** A preset with no capability declared is a language model. */
export function presetCapability(preset: ProviderPreset): ProviderCapability {
  return preset.capability ?? "language";
}

export function isLanguagePreset(preset: ProviderPreset): boolean {
  return presetCapability(preset) === "language";
}

export function isEvaluationPreset(preset: ProviderPreset): boolean {
  return presetCapability(preset) === "evaluation";
}
