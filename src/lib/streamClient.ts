import {
  AgentSlotConfig,
  GeneratedMediaAsset,
  PotItem,
  RuntimeCredentials,
} from "@/src/types/orchestrator";

export interface StreamCallbacks {
  onStatus?: (message: string) => void;
  onDelta?: (text: string) => void;
  onMedia?: (asset: GeneratedMediaAsset) => void;
}

export async function executeAgentStream(params: {
  slot: Pick<
    AgentSlotConfig,
    "provider" | "modelId" | "systemPrompt" | "taskDirective"
  >;
  credentials: RuntimeCredentials;
  potItems: PotItem[];
  peerContext?: string;
  signal: AbortSignal;
  callbacks: StreamCallbacks;
}): Promise<{ text: string; mediaAssets: GeneratedMediaAsset[] }> {
  const { slot, credentials, potItems, peerContext, signal, callbacks } = params;

  let apiKey = "";
  let accountId = "";
  let baseUrl = "";

  if (slot.provider === "gemini") {
    apiKey = credentials.geminiApiKey;
  } else if (slot.provider === "cloudflare") {
    apiKey = credentials.cloudflareApiToken;
    accountId = credentials.cloudflareAccountId;
    baseUrl = credentials.cloudflareCustomUrl;
  } else if (slot.provider === "openai") {
    apiKey = credentials.openaiApiKey;
    baseUrl = credentials.openaiBaseUrl;
  }

  const response = await fetch("/api/orchestrate/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      provider: slot.provider,
      modelId: slot.modelId,
      apiKey,
      accountId,
      baseUrl,
      systemPrompt: slot.systemPrompt,
      taskDirective: slot.taskDirective,
      potItems: potItems.map((p) => ({
        id: p.id,
        name: p.name,
        mimeType: p.mimeType,
        kind: p.kind,
        textContent: p.textContent,
        base64Data: p.base64Data,
      })),
      peerContext,
    }),
  });

  if (!response.ok) {
    throw new Error(`Server returned HTTP ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Streaming body unavailable.");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  const mediaAssets: GeneratedMediaAsset[] = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const lines = frame.split("\n");
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const jsonStr = line.slice(5).trim();
        if (!jsonStr) continue;
        const evt = JSON.parse(jsonStr) as {
          type: string;
          message?: string;
          text?: string;
          asset?: GeneratedMediaAsset;
        };

        if (evt.type === "status" && evt.message) {
          callbacks.onStatus?.(evt.message);
        } else if (evt.type === "delta" && evt.text) {
          fullText += evt.text;
          callbacks.onDelta?.(evt.text);
        } else if (evt.type === "media" && evt.asset) {
          mediaAssets.push(evt.asset);
          callbacks.onMedia?.(evt.asset);
        } else if (evt.type === "error") {
          throw new Error(evt.message || "Unknown orchestration error");
        }
      }
    }
  }

  return { text: fullText, mediaAssets };
}
