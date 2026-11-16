import JSZip from "jszip";
import {
  AgentSlotConfig,
  AgentSlotExecution,
  ExecutionLogEntry,
  GeneratedMediaAsset,
  PotItem,
  WorkspaceTopology,
} from "@/src/types/orchestrator";
import { convertOutputToCsv, extractStructuredJson } from "@/src/lib/polymorphicParser";

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeSlug(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "agent";
}

export function exportAgentTextFile(
  slot: AgentSlotConfig,
  execution: AgentSlotExecution,
  ext: "txt" | "md" | "json" | "csv"
) {
  const slug = safeSlug(slot.label);
  const text = execution.outputText || "";

  if (ext === "json") {
    const parsed = extractStructuredJson(text);
    const payload = {
      slotId: slot.id,
      label: slot.label,
      provider: slot.provider,
      modelId: slot.modelId,
      team: slot.team,
      systemPrompt: slot.systemPrompt,
      taskDirective: slot.taskDirective,
      status: execution.status,
      durationMs: execution.durationMs,
      structuredOutput: parsed,
      rawText: text,
      mediaAssets: execution.mediaAssets.map((m) => ({
        filename: m.filename,
        kind: m.kind,
        mimeType: m.mimeType,
      })),
    };
    triggerDownload(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
      `${slug}_output.json`
    );
    return;
  }

  if (ext === "csv") {
    const csv = convertOutputToCsv(text);
    triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${slug}_output.csv`);
    return;
  }

  if (ext === "md") {
    const md = [
      `# ${slot.label} (${slot.provider} · ${slot.modelId})`,
      "",
      `- **Status:** ${execution.status}`,
      `- **Team:** ${slot.team}`,
      execution.durationMs ? `- **Duration:** ${(execution.durationMs / 1000).toFixed(2)}s` : "",
      "",
      `## Task Directive`,
      slot.taskDirective || "_None_",
      "",
      `## Output`,
      text,
    ]
      .filter(Boolean)
      .join("\n");
    triggerDownload(new Blob([md], { type: "text/markdown;charset=utf-8" }), `${slug}_output.md`);
    return;
  }

  triggerDownload(new Blob([text], { type: "text/plain;charset=utf-8" }), `${slug}_output.txt`);
}

async function dataUrlOrFetchToBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  return await res.blob();
}

export async function exportMediaAssetFile(
  asset: GeneratedMediaAsset,
  overrideExt?: string
) {
  const blob = await dataUrlOrFetchToBlob(asset.dataUrl);
  let filename = asset.filename;
  if (overrideExt) {
    const base = filename.replace(/\.[^.]+$/, "");
    filename = `${base}.${overrideExt}`;
  }
  triggerDownload(blob, filename);
}

export async function exportFullSessionArchive(params: {
  topology: WorkspaceTopology;
  slots: AgentSlotConfig[];
  executions: Record<string, AgentSlotExecution>;
  potItems: PotItem[];
  executionLogs: ExecutionLogEntry[];
  synthesisOutput?: AgentSlotExecution | null;
}) {
  const { topology, slots, executions, potItems, executionLogs, synthesisOutput } = params;
  const zip = new JSZip();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  // 1. Central Input & Config Manifest (excluding sensitive API keys)
  const manifest = {
    exportedAt: new Date().toISOString(),
    topology,
    dataPotManifest: potItems.map((p) => ({
      id: p.id,
      name: p.name,
      mimeType: p.mimeType,
      kind: p.kind,
      sizeBytes: p.size,
      addedAt: new Date(p.addedAt).toISOString(),
    })),
    agentSlots: slots.map((s) => ({
      id: s.id,
      label: s.label,
      enabled: s.enabled,
      team: s.team,
      provider: s.provider,
      modelId: s.modelId,
      systemPrompt: s.systemPrompt,
      taskDirective: s.taskDirective,
      executionStatus: executions[s.id]?.status ?? "idle",
      durationMs: executions[s.id]?.durationMs ?? null,
    })),
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  // 2. Central Data Pot Assets
  const potFolder = zip.folder("data-pot");
  if (potFolder) {
    for (const item of potItems) {
      if (item.textContent !== undefined) {
        potFolder.file(item.name, item.textContent);
      } else if (item.base64Data) {
        potFolder.file(item.name, item.base64Data, { base64: true });
      }
    }
  }

  // 3. Per-Agent Configurations, Text Outputs & Generated Media
  const agentsFolder = zip.folder("agents");
  if (agentsFolder) {
    for (const slot of slots) {
      const exec = executions[slot.id];
      const folderName = `${safeSlug(slot.id)}_${safeSlug(slot.label)}`;
      const slotFolder = agentsFolder.folder(folderName);
      if (!slotFolder) continue;

      slotFolder.file(
        "config.json",
        JSON.stringify(
          {
            id: slot.id,
            label: slot.label,
            provider: slot.provider,
            modelId: slot.modelId,
            team: slot.team,
            systemPrompt: slot.systemPrompt,
            taskDirective: slot.taskDirective,
          },
          null,
          2
        )
      );

      if (exec) {
        slotFolder.file("output.md", exec.outputText || "");
        slotFolder.file("output.txt", exec.outputText || "");
        const maybeJson = extractStructuredJson(exec.outputText || "");
        if (maybeJson) {
          slotFolder.file("extracted.json", JSON.stringify(maybeJson, null, 2));
        }
        if (exec.errorMessage) {
          slotFolder.file("error.txt", exec.errorMessage);
        }

        for (let idx = 0; idx < exec.mediaAssets.length; idx++) {
          const asset = exec.mediaAssets[idx];
          try {
            const blob = await dataUrlOrFetchToBlob(asset.dataUrl);
            const buf = await blob.arrayBuffer();
            slotFolder.file(`media/${idx + 1}_${asset.filename}`, buf);
          } catch {
            slotFolder.file(`media/${idx + 1}_url.txt`, asset.dataUrl);
          }
        }
      }
    }
  }

  // 4. Synthesis Output (Round-Table)
  if (synthesisOutput && (synthesisOutput.outputText || synthesisOutput.mediaAssets.length > 0)) {
    const synFolder = zip.folder("synthesis");
    synFolder?.file("round-table-synthesis.md", synthesisOutput.outputText || "");
  }

  // 5. Execution & Split-Table Rebuttal Logs
  const logsFolder = zip.folder("logs");
  if (logsFolder) {
    logsFolder.file("execution-logs.json", JSON.stringify(executionLogs, null, 2));
    const transcriptMd = executionLogs
      .map(
        (entry) =>
          `## Round ${entry.round} — ${entry.phase} | ${entry.slotLabel} (${entry.provider}: ${entry.modelId})${
            entry.team ? ` [Team ${entry.team}]` : ""
          }\n*Timestamp: ${new Date(entry.timestamp).toISOString()}*\n\n${
            entry.error ? `**ERROR:** ${entry.error}` : entry.outputText
          }\n\n---`
      )
      .join("\n\n");
    logsFolder.file("execution-transcript.md", transcriptMd || "No execution rounds recorded.");
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  triggerDownload(zipBlob, `polytable-session-${timestamp}.zip`);
}
