export type ProviderId = "gemini" | "cloudflare" | "openai";

export type WorkspaceTopology = "round-table" | "split-table";

export type TeamAssignment = "A" | "B";

export type PotItemKind = "text" | "image" | "audio" | "video" | "pdf";

export interface PotItem {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: PotItemKind;
  textContent?: string;
  base64Data?: string; // raw base64 without data: prefix
  previewUrl?: string; // object/data URL in memory only
  addedAt: number;
}

export type SlotStatus = "idle" | "queued" | "streaming" | "completed" | "error" | "aborted";

export interface GeneratedMediaAsset {
  id: string;
  kind: "image" | "audio" | "video";
  mimeType: string;
  dataUrl: string;
  filename: string;
}

export interface AgentSlotConfig {
  id: string;
  label: string;
  provider: ProviderId;
  modelId: string;
  systemPrompt: string;
  taskDirective: string;
  team: TeamAssignment;
  enabled: boolean;
}

export interface AgentSlotExecution {
  slotId: string;
  status: SlotStatus;
  phaseLabel?: string;
  outputText: string;
  mediaAssets: GeneratedMediaAsset[];
  errorMessage?: string;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  roundNumber?: number;
}

export interface ExecutionLogEntry {
  id: string;
  timestamp: number;
  round: number;
  phase: string;
  topology: WorkspaceTopology;
  slotId: string;
  slotLabel: string;
  team?: TeamAssignment;
  provider: ProviderId;
  modelId: string;
  outputText: string;
  mediaCount: number;
  durationMs?: number;
  error?: string;
}

export interface RuntimeCredentials {
  geminiApiKey: string;
  openaiApiKey: string;
  openaiBaseUrl: string;
  cloudflareApiToken: string;
  cloudflareAccountId: string;
  cloudflareCustomUrl: string;
}
