import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, Code2, FileText, Maximize2 } from "lucide-react";
import { GeneratedMediaAsset } from "@/src/types/orchestrator";
import {
  extractChartDataset,
  extractStructuredJson,
} from "@/src/lib/polymorphicParser";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/src/components/ui/toggle-group";

interface PolymorphicRendererProps {
  outputText: string;
  mediaAssets: GeneratedMediaAsset[];
  emptyMessage?: string;
}

const CHART_COLORS = [
  "#0f172a",
  "#2563eb",
  "#059669",
  "#d97706",
];

export function PolymorphicRenderer({
  outputText,
  mediaAssets,
  emptyMessage = "No output generated yet. Configure model & task directive, then run this slot.",
}: PolymorphicRendererProps) {
  const [viewMode, setViewMode] = useState<"rendered" | "chart" | "raw">("rendered");
  const [chartType, setChartType] = useState<"bar" | "line">("bar");
  const [lightboxAsset, setLightboxAsset] = useState<GeneratedMediaAsset | null>(null);

  const chartDataset = useMemo(
    () => (outputText ? extractChartDataset(outputText) : null),
    [outputText]
  );

  const structuredJson = useMemo(
    () => (outputText ? extractStructuredJson(outputText) : null),
    [outputText]
  );

  if (!outputText && mediaAssets.length === 0) {
    return (
      <div className="flex h-full min-h-[140px] items-center justify-center rounded-md border border-dashed bg-muted/15 p-4 text-center">
        <p className="text-xs text-muted-foreground max-w-xs">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Polymorphic Media Assets */}
      {mediaAssets.length > 0 && (
        <div className="space-y-2.5">
          {mediaAssets.map((asset) => {
            if (asset.kind === "image") {
              return (
                <div
                  key={asset.id}
                  className="relative overflow-hidden rounded-md border bg-muted/20"
                >
                  <img
                    src={asset.dataUrl}
                    alt={asset.filename}
                    referrerPolicy="no-referrer"
                    className="w-full max-h-64 object-contain bg-black/5"
                  />
                  <div className="flex items-center justify-between border-t bg-card px-2.5 py-1.5 text-xs">
                    <span className="font-mono text-[11px] text-muted-foreground truncate">
                      {asset.filename} · {asset.mimeType}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => setLightboxAsset(asset)}
                    >
                      <Maximize2 className="h-3 w-3 mr-1" />
                      Expand
                    </Button>
                  </div>
                </div>
              );
            }

            if (asset.kind === "audio") {
              return (
                <div
                  key={asset.id}
                  className="rounded-md border bg-muted/20 p-2.5 space-y-1.5"
                >
                  <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                    <span>{asset.filename}</span>
                    <span>{asset.mimeType}</span>
                  </div>
                  <audio controls src={asset.dataUrl} className="w-full h-9" />
                </div>
              );
            }

            if (asset.kind === "video") {
              return (
                <div
                  key={asset.id}
                  className="rounded-md border bg-muted/20 overflow-hidden"
                >
                  <video
                    controls
                    src={asset.dataUrl}
                    className="w-full max-h-64 bg-black"
                  />
                  <div className="px-2.5 py-1 text-[11px] font-mono text-muted-foreground border-t bg-card">
                    {asset.filename} · {asset.mimeType}
                  </div>
                </div>
              );
            }

            return null;
          })}
        </div>
      )}

      {/* Polymorphic View Mode Switcher (Rendered vs Interactive Chart vs Raw/JSON) */}
      {outputText && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(v) => {
              if (v === "rendered" || v === "chart" || v === "raw") setViewMode(v);
            }}
            size="sm"
          >
            <ToggleGroupItem value="rendered">
              <FileText className="h-3 w-3 mr-1" />
              Rendered
            </ToggleGroupItem>
            {chartDataset && (
              <ToggleGroupItem value="chart">
                <BarChart3 className="h-3 w-3 mr-1" />
                Chart
              </ToggleGroupItem>
            )}
            <ToggleGroupItem value="raw">
              <Code2 className="h-3 w-3 mr-1" />
              {structuredJson ? "JSON" : "Raw"}
            </ToggleGroupItem>
          </ToggleGroup>

          {viewMode === "chart" && chartDataset && (
            <ToggleGroup
              type="single"
              value={chartType}
              onValueChange={(v) => {
                if (v === "bar" || v === "line") setChartType(v);
              }}
              size="sm"
            >
              <ToggleGroupItem value="bar">Bar</ToggleGroupItem>
              <ToggleGroupItem value="line">Line</ToggleGroupItem>
            </ToggleGroup>
          )}
        </div>
      )}

      {/* Interactive Recharts Visualization */}
      {outputText && viewMode === "chart" && chartDataset && (
        <div className="rounded-md border bg-card p-3">
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === "bar" ? (
                <BarChart data={chartDataset.rows}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                  <XAxis dataKey={chartDataset.labelKey} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <RechartsTooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {chartDataset.numericKeys.map((k, idx) => (
                    <Bar
                      key={k}
                      dataKey={k}
                      fill={CHART_COLORS[idx % CHART_COLORS.length]}
                      radius={[3, 3, 0, 0]}
                    />
                  ))}
                </BarChart>
              ) : (
                <LineChart data={chartDataset.rows}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                  <XAxis dataKey={chartDataset.labelKey} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <RechartsTooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {chartDataset.numericKeys.map((k, idx) => (
                    <Line
                      key={k}
                      type="monotone"
                      dataKey={k}
                      stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  ))}
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Raw / Structured JSON View */}
      {outputText && viewMode === "raw" && (
        <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
          {structuredJson ? JSON.stringify(structuredJson, null, 2) : outputText}
        </pre>
      )}

      {/* Markdown / Table / Diff View */}
      {outputText && viewMode === "rendered" && (
        <div className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed break-words">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              table: ({ children }) => (
                <div className="my-2 overflow-x-auto rounded-md border">
                  <table className="w-full border-collapse text-xs tabular-nums">
                    {children}
                  </table>
                </div>
              ),
              thead: ({ children }) => (
                <thead className="bg-muted/60 border-b">{children}</thead>
              ),
              th: ({ children }) => (
                <th className="px-2.5 py-1.5 text-left font-semibold">{children}</th>
              ),
              td: ({ children }) => (
                <td className="px-2.5 py-1.5 border-t">{children}</td>
              ),
              code: ({ className, children, ...props }) => {
                const isBlock = className?.includes("language-");
                const rawCode = String(children ?? "");
                if (className === "language-diff") {
                  return (
                    <pre className="my-2 overflow-x-auto rounded-md border bg-muted/40 p-2.5 font-mono text-[11px]">
                      {rawCode.split("\n").map((line, i) => {
                        const cls = line.startsWith("+")
                          ? "text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 block px-1"
                          : line.startsWith("-")
                          ? "text-rose-700 dark:text-rose-400 bg-rose-500/10 block px-1"
                          : "block px-1";
                        return (
                          <span key={i} className={cls}>
                            {line}
                          </span>
                        );
                      })}
                    </pre>
                  );
                }
                if (isBlock) {
                  return (
                    <pre className="my-2 overflow-x-auto rounded-md border bg-muted/40 p-2.5 font-mono text-[11px]">
                      <code className={className} {...props}>
                        {children}
                      </code>
                    </pre>
                  );
                }
                return (
                  <code
                    className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]"
                    {...props}
                  >
                    {children}
                  </code>
                );
              },
            }}
          >
            {outputText}
          </ReactMarkdown>
        </div>
      )}

      {/* Image Lightbox Dialog */}
      <Dialog
        open={Boolean(lightboxAsset)}
        onOpenChange={(open) => {
          if (!open) setLightboxAsset(null);
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">
              {lightboxAsset?.filename}
            </DialogTitle>
          </DialogHeader>
          {lightboxAsset && (
            <img
              src={lightboxAsset.dataUrl}
              alt={lightboxAsset.filename}
              referrerPolicy="no-referrer"
              className="w-full max-h-[75vh] object-contain rounded-md border"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
