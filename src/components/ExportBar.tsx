import { useState } from "react";
import { Archive, FileJson, FileText, Loader2 } from "lucide-react";
import {
  AgentSlotConfig,
  AgentSlotExecution,
  ExecutionLogEntry,
  PotItem,
  WorkspaceTopology,
} from "@/src/types/orchestrator";
import {
  exportFullSessionArchive,
  triggerDownload,
} from "@/src/lib/exportEngine";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";

interface ExportBarProps {
  topology: WorkspaceTopology;
  slots: AgentSlotConfig[];
  executions: Record<string, AgentSlotExecution>;
  potItems: PotItem[];
  executionLogs: ExecutionLogEntry[];
  synthesisOutput: AgentSlotExecution | null;
}

export function ExportBar({
  topology,
  slots,
  executions,
  potItems,
  executionLogs,
  synthesisOutput,
}: ExportBarProps) {
  const [zipping, setZipping] = useState(false);

  const completedCount = slots.filter(
    (s) => executions[s.id]?.status === "completed"
  ).length;
  const totalMediaCount =
    slots.reduce(
      (sum, s) => sum + (executions[s.id]?.mediaAssets.length ?? 0),
      0
    ) + (synthesisOutput?.mediaAssets.length ?? 0);

  async function handleExportZip() {
    setZipping(true);
    try {
      await exportFullSessionArchive({
        topology,
        slots,
        executions,
        potItems,
        executionLogs,
        synthesisOutput,
      });
    } finally {
      setZipping(false);
    }
  }

  function handleExportTranscript() {
    const sections = [
      `# PolyTable Session Transcript`,
      `Exported: ${new Date().toISOString()}`,
      `Topology: ${topology}`,
      "",
      `## Central Data Pot (${potItems.length} assets)`,
      ...potItems.map((p) => `- ${p.name} (${p.mimeType}, ${p.size} bytes)`),
      "",
      `## Agent Outputs`,
      ...slots.map((s) => {
        const ex = executions[s.id];
        return [
          `### ${s.label} — ${s.provider} · ${s.modelId}${
            topology === "split-table" ? ` [Team ${s.team}]` : ""
          }`,
          ex?.outputText || "_No output_",
        ].join("\n\n");
      }),
    ];

    if (synthesisOutput?.outputText) {
      sections.push("", "## Round-Table Synthesis", synthesisOutput.outputText);
    }

    triggerDownload(
      new Blob([sections.join("\n\n")], { type: "text/markdown;charset=utf-8" }),
      `polytable-transcript-${Date.now()}.md`
    );
  }

  function handleExportManifestJson() {
    const manifest = {
      exportedAt: new Date().toISOString(),
      topology,
      potItems: potItems.map((p) => ({
        name: p.name,
        mimeType: p.mimeType,
        kind: p.kind,
        size: p.size,
      })),
      slots,
      executionLogs,
    };
    triggerDownload(
      new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }),
      `polytable-manifest-${Date.now()}.json`
    );
  }

  return (
    <Card className="sticky bottom-3 z-30 border shadow-md bg-card/95 backdrop-blur-sm">
      <CardContent className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="font-semibold text-foreground">
            Session Export Engine
          </span>
          <span className="text-muted-foreground hidden sm:inline">·</span>
          <span className="font-mono text-muted-foreground tabular-nums">
            {potItems.length} pot assets · {completedCount}/{slots.length} completed · {totalMediaCount} media files · {executionLogs.length} log entries
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs whitespace-nowrap"
            onClick={handleExportManifestJson}
          >
            <FileJson className="h-3.5 w-3.5 mr-1.5" />
            Manifest (.json)
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs whitespace-nowrap"
            onClick={handleExportTranscript}
          >
            <FileText className="h-3.5 w-3.5 mr-1.5" />
            Transcript (.md)
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            className="h-8 text-xs whitespace-nowrap"
            disabled={zipping}
            onClick={() => void handleExportZip()}
          >
            {zipping ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Archive className="h-3.5 w-3.5 mr-1.5" />
            )}
            {zipping ? "Bundling .zip..." : "Export Full Session (.zip)"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
