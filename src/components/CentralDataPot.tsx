import { useRef, useState } from "react";
import {
  FileAudio,
  FileCode2,
  FileImage,
  FileText,
  FileVideo,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { PotItem, PotItemKind } from "@/src/types/orchestrator";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { Textarea } from "@/src/components/ui/textarea";

interface CentralDataPotProps {
  items: PotItem[];
  onAddItems: (newItems: PotItem[]) => void;
  onRemoveItem: (id: string) => void;
  onClearAll: () => void;
}

function classifyFile(file: File): { kind: PotItemKind; isText: boolean } {
  const nameLower = file.name.toLowerCase();
  const mime = file.type.toLowerCase();

  if (mime.startsWith("image/")) return { kind: "image", isText: false };
  if (mime.startsWith("audio/")) return { kind: "audio", isText: false };
  if (mime.startsWith("video/")) return { kind: "video", isText: false };
  if (mime === "application/pdf" || nameLower.endsWith(".pdf")) {
    return { kind: "pdf", isText: false };
  }
  if (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    nameLower.endsWith(".txt") ||
    nameLower.endsWith(".md") ||
    nameLower.endsWith(".csv") ||
    nameLower.endsWith(".json") ||
    nameLower.endsWith(".yaml") ||
    nameLower.endsWith(".yml") ||
    nameLower.endsWith(".xml") ||
    nameLower.endsWith(".log")
  ) {
    return { kind: "text", isText: true };
  }
  return { kind: "text", isText: true };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function renderKindIcon(kind: PotItemKind) {
  switch (kind) {
    case "image":
      return <FileImage className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />;
    case "audio":
      return <FileAudio className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />;
    case "video":
      return <FileVideo className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />;
    case "pdf":
      return <FileText className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />;
    default:
      return <FileCode2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />;
  }
}

export function CentralDataPot({
  items,
  onAddItems,
  onRemoveItem,
  onClearAll,
}: CentralDataPotProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [rawName, setRawName] = useState("context_notes.md");
  const [rawMime, setRawMime] = useState("text/markdown");
  const [rawBody, setRawBody] = useState("");

  async function ingestFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const processed: PotItem[] = [];

    for (const file of Array.from(fileList)) {
      const { kind, isText } = classifyFile(file);
      const id = `pot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      if (isText) {
        const textContent = await file.text();
        processed.push({
          id,
          name: file.name,
          mimeType: file.type || "text/plain",
          size: file.size,
          kind: "text",
          textContent,
          addedAt: Date.now(),
        });
      } else {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        const commaIdx = dataUrl.indexOf(",");
        const base64Data = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
        processed.push({
          id,
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          kind,
          base64Data,
          previewUrl: dataUrl,
          addedAt: Date.now(),
        });
      }
    }

    onAddItems(processed);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleAddRawPayload() {
    if (!rawBody.trim()) return;
    const bytes = new Blob([rawBody]).size;
    onAddItems([
      {
        id: `pot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: rawName.trim() || "payload.txt",
        mimeType: rawMime,
        size: bytes,
        kind: "text",
        textContent: rawBody,
        addedAt: Date.now(),
      },
    ]);
    setRawBody("");
  }

  function handleLoadSampleDataset() {
    const csvContent = [
      "quarter,region,active_users,conversion_pct,latency_ms,churn_pct",
      "Q1,North America,48200,3.8,142,2.4",
      "Q2,North America,53900,4.2,135,2.1",
      "Q3,North America,61400,4.7,118,1.8",
      "Q1,Europe,31500,3.1,168,2.9",
      "Q2,Europe,36800,3.5,154,2.5",
      "Q3,Europe,44100,4.1,129,2.0",
    ].join("\n");

    const briefContent = [
      "# Regional Edge Migration Evaluation Brief",
      "",
      "## Context",
      "We are evaluating whether to accelerate edge compute rollout in Europe ahead of Q4 peak traffic while introducing tiered multimodal inference pricing.",
      "",
      "## Open Questions for Agents",
      "1. Does the Q1-Q3 latency reduction correlate strongly enough with conversion gains to justify capital expenditure?",
      "2. What edge cases, churn risks, or regional compliance assumptions are missing from the telemetry table?",
      "3. Provide structured JSON or Markdown tables for quantitative findings so visualizations can be inspected.",
    ].join("\n");

    onAddItems([
      {
        id: `pot-sample-csv-${Date.now()}`,
        name: "regional_telemetry_q1_q3.csv",
        mimeType: "text/csv",
        size: new Blob([csvContent]).size,
        kind: "text",
        textContent: csvContent,
        addedAt: Date.now(),
      },
      {
        id: `pot-sample-md-${Date.now()}`,
        name: "edge_migration_brief.md",
        mimeType: "text/markdown",
        size: new Blob([briefContent]).size,
        kind: "text",
        textContent: briefContent,
        addedAt: Date.now(),
      },
    ]);
  }

  const totalBytes = items.reduce((acc, i) => acc + i.size, 0);

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold">
              Central Shared Data Pot
            </CardTitle>
            <CardDescription className="text-xs">
              Universal multimodal context hub ingested simultaneously by all active agent slots.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {items.length} assets · {formatBytes(totalBytes)}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs whitespace-nowrap shrink-0"
              onClick={handleLoadSampleDataset}
            >
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              Load Sample Brief
            </Button>
            {items.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-destructive hover:text-destructive whitespace-nowrap shrink-0"
                onClick={onClearAll}
              >
                Clear Pot
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Ingestion Controls */}
        <div className="lg:col-span-5">
          <Tabs defaultValue="upload" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="upload">Multimodal Files</TabsTrigger>
              <TabsTrigger value="raw">Raw Payload</TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="mt-2">
              <Card
                className={`border-dashed transition-colors ${
                  isDragging ? "border-primary bg-accent/50" : "border-border bg-muted/20"
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  void ingestFiles(e.dataTransfer.files);
                }}
              >
                <CardContent className="flex flex-col items-center justify-center p-5 text-center gap-2.5">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">
                      Drop files here or select from disk
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Supports .txt, .md, .csv, .json, .pdf, Images, Audio, and Video
                    </p>
                  </div>
                  <Input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".txt,.md,.csv,.json,.pdf,.yaml,.yml,.xml,.log,image/*,audio/*,video/*"
                    className="hidden"
                    onChange={(e) => void ingestFiles(e.target.files)}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Browse Multimodal Files
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="raw" className="mt-2 space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="raw-filename">Asset Name</Label>
                  <Input
                    id="raw-filename"
                    value={rawName}
                    onChange={(e) => setRawName(e.target.value)}
                    placeholder="payload.json"
                    className="h-8 font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="raw-mime">Format / MIME</Label>
                  <Select value={rawMime} onValueChange={setRawMime}>
                    <SelectTrigger id="raw-mime" className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text/markdown">Markdown (.md)</SelectItem>
                      <SelectItem value="text/plain">Plain Text (.txt)</SelectItem>
                      <SelectItem value="text/csv">CSV Table (.csv)</SelectItem>
                      <SelectItem value="application/json">JSON (.json)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Textarea
                value={rawBody}
                onChange={(e) => setRawBody(e.target.value)}
                placeholder="Paste raw text, CSV rows, JSON records, or prompt context..."
                className="min-h-[92px] font-mono text-xs"
              />
              <Button
                type="button"
                size="sm"
                className="w-full"
                disabled={!rawBody.trim()}
                onClick={handleAddRawPayload}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add Payload to Pot
              </Button>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right: Active Pot Inventory */}
        <div className="lg:col-span-7 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs text-muted-foreground">
              Ingested Pot Context ({items.length})
            </Label>
          </div>
          {items.length === 0 ? (
            <Card className="flex-1 bg-muted/15 border-dashed">
              <CardContent className="flex flex-col items-center justify-center h-[196px] p-4 text-center">
                <p className="text-sm font-medium text-muted-foreground">
                  Data Pot is empty
                </p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  Upload text, PDFs, CSV datasets, images, audio, or video—or load the sample brief to start orchestrating across all slots.
                </p>
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="h-[196px] rounded-md border bg-muted/10 p-2">
              <div className="space-y-2">
                {items.map((item) => (
                  <Card key={item.id} className="bg-card">
                    <CardContent className="p-2.5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {item.kind === "image" && item.previewUrl ? (
                          <img
                            src={item.previewUrl}
                            alt={item.name}
                            referrerPolicy="no-referrer"
                            className="h-10 w-10 rounded object-cover border shrink-0"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded border bg-muted/50 flex items-center justify-center shrink-0">
                            {renderKindIcon(item.kind)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium truncate">
                              {item.name}
                            </span>
                            <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">
                              {item.kind}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground font-mono tabular-nums truncate">
                            {item.mimeType} · {formatBytes(item.size)}
                            {item.textContent
                              ? ` · "${item.textContent.slice(0, 60).replace(/\s+/g, " ")}"`
                              : ""}
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => onRemoveItem(item.id)}
                        aria-label={`Remove ${item.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
