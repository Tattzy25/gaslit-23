import { useEffect, useState } from "react";
import {
  AlertCircle,
  Download,
  FileDown,
  Play,
  Square,
  SlidersHorizontal,
  TerminalSquare,
} from "lucide-react";
import {
  AgentSlotConfig,
  AgentSlotExecution,
  ProviderId,
  TeamAssignment,
  WorkspaceTopology,
} from "@/src/types/orchestrator";
import {
  exportAgentTextFile,
  exportMediaAssetFile,
} from "@/src/lib/exportEngine";
import { PolymorphicRenderer } from "@/src/components/PolymorphicRenderer";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Progress } from "@/src/components/ui/progress";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Switch } from "@/src/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { Textarea } from "@/src/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/src/components/ui/toggle-group";

interface AgentSlotCardProps {
  slot: AgentSlotConfig;
  execution: AgentSlotExecution;
  topology: WorkspaceTopology;
  onUpdateSlot: (updated: AgentSlotConfig) => void;
  onRunSlot: (slotId: string) => void;
  onStopSlot: (slotId: string) => void;
}

function getStatusBadgeVariant(
  status: AgentSlotExecution["status"]
): "secondary" | "default" | "success" | "destructive" | "warning" {
  switch (status) {
    case "streaming":
    case "queued":
      return "default";
    case "completed":
      return "success";
    case "error":
      return "destructive";
    case "aborted":
      return "warning";
    default:
      return "secondary";
  }
}

export function AgentSlotCard({
  slot,
  execution,
  topology,
  onUpdateSlot,
  onRunSlot,
  onStopSlot,
}: AgentSlotCardProps) {
  const [activeTab, setActiveTab] = useState<"config" | "output">("config");

  const isRunning = execution.status === "streaming" || execution.status === "queued";
  const hasOutput =
    execution.outputText.length > 0 ||
    execution.mediaAssets.length > 0 ||
    Boolean(execution.errorMessage);

  // Automatically reveal live output tab when slot begins streaming
  useEffect(() => {
    if (isRunning) {
      setActiveTab("output");
    }
  }, [isRunning]);

  const progressValue =
    execution.status === "idle"
      ? 0
      : execution.status === "queued"
      ? 20
      : execution.status === "streaming"
      ? 68
      : 100;

  return (
    <Card className={`flex flex-col h-full ${!slot.enabled ? "opacity-65" : ""}`}>
      <CardHeader className="pb-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Switch
              checked={slot.enabled}
              onCheckedChange={(checked) =>
                onUpdateSlot({ ...slot, enabled: checked })
              }
              aria-label={`Toggle ${slot.label}`}
            />
            <CardTitle className="text-sm font-semibold truncate">
              {slot.label}
            </CardTitle>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {execution.durationMs !== undefined && (
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                {(execution.durationMs / 1000).toFixed(2)}s
              </span>
            )}
            <Badge variant={getStatusBadgeVariant(execution.status)}>
              {execution.status}
            </Badge>
          </div>
        </div>

        {/* Provider + Team Assignment Summary Row */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-[11px] text-muted-foreground truncate max-w-[220px]">
            {slot.provider} · {slot.modelId || "no-model-id"}
          </span>

          {topology === "split-table" && (
            <ToggleGroup
              type="single"
              size="sm"
              value={slot.team}
              onValueChange={(val) => {
                if (val === "A" || val === "B") {
                  onUpdateSlot({ ...slot, team: val as TeamAssignment });
                }
              }}
            >
              <ToggleGroupItem value="A">Table A</ToggleGroupItem>
              <ToggleGroupItem value="B">Table B</ToggleGroupItem>
            </ToggleGroup>
          )}
        </div>

        {(isRunning || execution.status === "completed") && (
          <div className="space-y-1">
            <Progress value={progressValue} />
            {execution.phaseLabel && (
              <p className="text-[11px] text-muted-foreground truncate">
                {execution.phaseLabel}
              </p>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 flex flex-col pb-3">
        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            if (v === "config" || v === "output") setActiveTab(v);
          }}
          className="flex-1 flex flex-col"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="config" className="gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Configure
            </TabsTrigger>
            <TabsTrigger value="output" className="gap-1.5">
              <TerminalSquare className="h-3.5 w-3.5" />
              Output
              {hasOutput && (
                <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                  ({execution.mediaAssets.length > 0 ? `${execution.mediaAssets.length}m` : `${execution.outputText.length}c`})
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="config" className="space-y-3 mt-3 flex-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label htmlFor={`${slot.id}-provider`}>Provider</Label>
                <Select
                  value={slot.provider}
                  onValueChange={(val) =>
                    onUpdateSlot({ ...slot, provider: val as ProviderId })
                  }
                >
                  <SelectTrigger id={`${slot.id}-provider`} className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gemini">Google Gemini</SelectItem>
                    <SelectItem value="cloudflare">Cloudflare Workers AI</SelectItem>
                    <SelectItem value="openai">OpenAI</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor={`${slot.id}-label`}>Slot Label</Label>
                <Input
                  id={`${slot.id}-label`}
                  value={slot.label}
                  onChange={(e) =>
                    onUpdateSlot({ ...slot, label: e.target.value })
                  }
                  className="h-8 text-xs"
                  placeholder="Agent Name"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor={`${slot.id}-model`}>
                Raw Model ID (Unvalidated Runtime String)
              </Label>
              <Input
                id={`${slot.id}-model`}
                value={slot.modelId}
                onChange={(e) =>
                  onUpdateSlot({ ...slot, modelId: e.target.value })
                }
                placeholder="e.g., gemini-4-hydrogen, @cf/black-forest-labs/flux-1-schnell, gpt-4o"
                className="h-8 font-mono text-xs"
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor={`${slot.id}-system`}>System Prompt</Label>
              <Textarea
                id={`${slot.id}-system`}
                value={slot.systemPrompt}
                onChange={(e) =>
                  onUpdateSlot({ ...slot, systemPrompt: e.target.value })
                }
                placeholder="Persona, analytical rules, output format constraints..."
                className="min-h-[70px] text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor={`${slot.id}-task`}>Task Directive</Label>
              <Textarea
                id={`${slot.id}-task`}
                value={slot.taskDirective}
                onChange={(e) =>
                  onUpdateSlot({ ...slot, taskDirective: e.target.value })
                }
                placeholder="Specific target or asset generation instruction from the shared data pot..."
                className="min-h-[76px] text-xs"
              />
            </div>
          </TabsContent>

          <TabsContent value="output" className="mt-3 flex-1 flex flex-col">
            {execution.errorMessage && (
              <div className="mb-2.5 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="break-words">{execution.errorMessage}</span>
              </div>
            )}
            <ScrollArea className="h-[290px] w-full rounded-md border bg-background p-3">
              <PolymorphicRenderer
                outputText={execution.outputText}
                mediaAssets={execution.mediaAssets}
              />
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>

      <CardFooter className="pt-0 flex items-center justify-between gap-2 border-t bg-muted/20 px-4 py-2.5">
        {isRunning ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="h-8 text-xs whitespace-nowrap"
            onClick={() => onStopSlot(slot.id)}
          >
            <Square className="h-3.5 w-3.5 mr-1.5" />
            Stop Slot
          </Button>
        ) : (
          <Button
            type="button"
            variant="default"
            size="sm"
            className="h-8 text-xs whitespace-nowrap"
            disabled={!slot.enabled || !slot.modelId.trim()}
            onClick={() => onRunSlot(slot.id)}
          >
            <Play className="h-3.5 w-3.5 mr-1.5" />
            Run Slot
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs whitespace-nowrap"
              disabled={!hasOutput}
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Text & Structured Data</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => exportAgentTextFile(slot, execution, "txt")}>
              <FileDown className="h-3.5 w-3.5" />
              Download .txt
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportAgentTextFile(slot, execution, "md")}>
              <FileDown className="h-3.5 w-3.5" />
              Download .md
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportAgentTextFile(slot, execution, "json")}>
              <FileDown className="h-3.5 w-3.5" />
              Download .json
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportAgentTextFile(slot, execution, "csv")}>
              <FileDown className="h-3.5 w-3.5" />
              Download .csv
            </DropdownMenuItem>

            {execution.mediaAssets.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Generated Media Assets</DropdownMenuLabel>
                {execution.mediaAssets.map((asset, i) => (
                  <div key={asset.id}>
                    {asset.kind === "image" && (
                      <>
                        <DropdownMenuItem
                          onClick={() => void exportMediaAssetFile(asset, "png")}
                        >
                          <Download className="h-3.5 w-3.5" />
                          Image #{i + 1} (.png)
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => void exportMediaAssetFile(asset, "jpg")}
                        >
                          <Download className="h-3.5 w-3.5" />
                          Image #{i + 1} (.jpg)
                        </DropdownMenuItem>
                      </>
                    )}
                    {asset.kind === "audio" && (
                      <>
                        <DropdownMenuItem
                          onClick={() => void exportMediaAssetFile(asset, "mp3")}
                        >
                          <Download className="h-3.5 w-3.5" />
                          Audio #{i + 1} (.mp3)
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => void exportMediaAssetFile(asset, "wav")}
                        >
                          <Download className="h-3.5 w-3.5" />
                          Audio #{i + 1} (.wav)
                        </DropdownMenuItem>
                      </>
                    )}
                    {asset.kind === "video" && (
                      <DropdownMenuItem
                        onClick={() => void exportMediaAssetFile(asset, "mp4")}
                      >
                        <Download className="h-3.5 w-3.5" />
                        Video #{i + 1} (.mp4)
                      </DropdownMenuItem>
                    )}
                  </div>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </CardFooter>
    </Card>
  );
}
