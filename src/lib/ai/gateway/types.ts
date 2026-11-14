// Centralized types and contracts for the ElétricAi Industrial OS AI Gateway,
// Provider Registry, Model Router, and Engineering Agent Tooling.

export const IS_PHYSICAL_CONTROL_ALLOWED = false as const;

export const AI_PROVIDER_IDS = [
  "gemini",
  "deepseek",
  "openai",
  "anthropic",
  "ollama",
  "openai-compatible",
] as const;

export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

export const AI_CONNECTION_STATES = [
  "NOT_CONFIGURED",
  "CONFIGURING",
  "CONNECTED",
  "DEGRADED",
  "DISCONNECTED",
  "ERROR",
] as const;

export type AiConnectionState = (typeof AI_CONNECTION_STATES)[number];

export const AI_MODULE_DISCIPLINES = [
  "unifilar",
  "multifilar",
  "ladder",
  "fbd",
  "scada",
  "plc",
  "simulation",
  "alarms",
  "studio_iec",
  "compact_studio",
  "hardware",
  "io",
  "comms",
  "importer",
  "validation",
  "general",
] as const;

export type AiModuleDiscipline = (typeof AI_MODULE_DISCIPLINES)[number];

export interface AiModelCapabilities {
  streaming: boolean;
  structuredOutput: boolean;
  toolCalling: boolean;
  vision: boolean;
  maxContextTokens: number;
  maxOutputTokens: number;
  isLocalOnly: boolean;
  thinkingModel?: boolean;
}

export interface AiProviderStatusSummary {
  provider: AiProviderId;
  label: string;
  model: string;
  availableModels: string[];
  endpoint: string;
  credentialEnvVar: string;
  credentialConfigured: boolean;
  credentialValidFormat: boolean;
  credentialMaskedPreview: string;
  credentialGuidance: string;
  maxOutputTokens: number;
  timeoutMs: number;
  temperature: number;
  rateLimitPerMinute: number;
  capabilities: AiModelCapabilities;
  connectionState: AiConnectionState;
  lastVerifiedAt: string | null;
  lastLatencyMs?: number;
  lastHttpStatus?: number;
  lastError?: string;
}

export interface AiAuditLogEntry {
  id: string;
  timestamp: string;
  operation: string;
  module: AiModuleDiscipline;
  provider: AiProviderId;
  model: string;
  durationMs: number;
  ok: boolean;
  statusCode?: number;
  errorCode?: string;
  errorMessage?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  fallbackUsed: boolean;
  toolsInvoked?: string[];
  projectId?: string;
  conversationId?: string;
}

export interface OllamaLocalStatus {
  reachable: boolean;
  endpoint: string;
  installedModels: string[];
  checkedAt: string;
  latencyMs?: number;
  error?: string;
}

export interface AiGatewayHealthStatus {
  state: AiConnectionState;
  activeProvider: AiProviderId;
  activeModel: string;
  lastCheckedAt: string | null;
  latencyMs?: number;
  httpStatus?: number;
  errorMessage?: string;
  physicalControlAllowed: typeof IS_PHYSICAL_CONTROL_ALLOWED;
  capabilities: AiModelCapabilities;
  subsystems: {
    memory: "READY" | "DEGRADED" | "OFFLINE";
    chat: "READY" | "BLOCKED" | "DEGRADED";
    diagramGeneration: "READY" | "BLOCKED" | "DEGRADED";
    engineeringAnalysis: "READY" | "BLOCKED" | "DEGRADED";
    toolCalling: "READY" | "BLOCKED" | "DEGRADED";
  };
  providers: AiProviderStatusSummary[];
  ollamaStatus: OllamaLocalStatus;
  usageStats: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    fallbackCount: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
  };
  recentAuditEvents: AiAuditLogEntry[];
  recentFailures: AiAuditLogEntry[];
}

export interface AiChatMessageTurn {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolName?: string;
}

export interface AiToolDeclaration {
  name: string;
  description: string;
  parametersJsonSchema: Record<string, unknown>;
}

export interface AiToolCallInvocation {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AiGatewayRequest {
  operation: string;
  module?: AiModuleDiscipline;
  provider?: AiProviderId;
  model?: string;
  systemPrompt?: string;
  messages: AiChatMessageTurn[];
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  responseJsonSchema?: Record<string, unknown>;
  tools?: AiToolDeclaration[];
  projectId?: string;
  conversationId?: string;
  allowFallback?: boolean;
}

export interface AiGatewayResponse {
  ok: boolean;
  text: string;
  provider: AiProviderId;
  model: string;
  durationMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  fallbackUsed: boolean;
  toolCalls?: AiToolCallInvocation[];
  error?: {
    code: string;
    message: string;
    status?: number;
  };
}
