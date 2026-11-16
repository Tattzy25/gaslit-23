import { useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  Layers,
  Moon,
  Play,
  RotateCcw,
  ShieldCheck,
  Square,
  Sun,
  Users,
} from "lucide-react";
import {
  AgentSlotConfig,
  AgentSlotExecution,
  ExecutionLogEntry,
  PotItem,
  ProviderId,
  RuntimeCredentials,
  WorkspaceTopology,
} from "@/src/types/orchestrator";
import { executeAgentStream } from "@/src/lib/streamClient";
import { AgentSlotCard } from "@/src/components/AgentSlotCard";
import { CentralDataPot } from "@/src/components/CentralDataPot";
import { CredentialsDialog } from "@/src/components/CredentialsDialog";
import { ExportBar } from "@/src/components/ExportBar";
import { PolymorphicRenderer } from "@/src/components/PolymorphicRenderer";
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
import { Progress } from "@/src/components/ui/progress";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Separator } from "@/src/components/ui/separator";
import { Switch } from "@/src/components/ui/switch";
import { Textarea } from "@/src/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/src/components/ui/toggle-group";

function createDefaultSlots(): AgentSlotConfig[] {
  return [
    {
      id: "slot-1",
      label: "Slot 01 · Analyst",
      provider: "gemini",
      modelId: "gemini-4-hydrogen",
      systemPrompt:
        "You are a precision quantitative analyst. Extract empirical metrics, trends, and structured tables from the shared workspace data pot.",
      taskDirective:
        "Analyze all assets in the data pot and produce a structured Markdown summary with a numeric comparison table.",
      team: "A",
      enabled: true,
    },
    {
      id: "slot-2",
      label: "Slot 02 · Architect",
      provider: "gemini",
      modelId: "gemini-4-hydrogen",
      systemPrompt:
        "You are a systems architect. Evaluate operational feasibility, bottlenecks, and technical trade-offs grounded strictly in the provided evidence.",
      taskDirective:
        "Propose concrete implementation recommendations and highlight any infrastructure dependencies implied by the data pot.",
      team: "A",
      enabled: true,
    },
    {
      id: "slot-3",
      label: "Slot 03 · Auditor",
      provider: "gemini",
      modelId: "gemini-4-hydrogen",
      systemPrompt:
        "You are an adversarial risk auditor. Identify gaps, unverified assumptions, contradictions, and edge cases.",
      taskDirective:
        "Audit the shared data pot (and any peer proposals) for statistical blind spots, missing variables, or logical flaws.",
      team: "B",
      enabled: true,
    },
    {
      id: "slot-4",
      label: "Slot 04 · Synthesizer",
      provider: "gemini",
      modelId: "gemini-4-hydrogen",
      systemPrompt:
        "You are an executive decision strategist. Return structured JSON metrics and clear strategic next steps.",
      taskDirective:
        "Produce a structured JSON array summarizing key metrics, risks, and confidence levels across the workspace.",
      team: "B",
      enabled: true,
    },
    {
      id: "slot-5",
      label: "Slot 05 · Specialist",
      provider: "gemini",
      modelId: "gemini-4-hydrogen",
      systemPrompt:
        "You are a multimodal creative and technical specialist. Adapt your output to match the exact task requirements.",
      taskDirective:
        "Provide an independent counter-perspective or multimodal asset synthesis grounded in the shared data pot.",
      team: "B",
      enabled: true,
    },
  ];
}

function createEmptyExecution(slotId: string): AgentSlotExecution {
  return {
    slotId,
    status: "idle",
    outputText: "",
    mediaAssets: [],
  };
}

function createInitialExecutions(slots: AgentSlotConfig[]): Record<string, AgentSlotExecution> {
  const map: Record<string, AgentSlotExecution> = {};
  for (const s of slots) {
    map[s.id] = createEmptyExecution(s.id);
  }
  return map;
}

export default function App() {
  // Strictly volatile in-memory state (zero persistence)
  const [darkMode, setDarkMode] = useState(false);
  const [hasServerGeminiKey, setHasServerGeminiKey] = useState(false);
  const [topology, setTopology] = useState<WorkspaceTopology>("round-table");
  const [slotCount, setSlotCount] = useState<4 | 5>(4);
  const [enableRoundTableSynthesis, setEnableRoundTableSynthesis] = useState(true);
  const [enableCrossExam, setEnableCrossExam] = useState(true);
  const [rebuttalRounds, setRebuttalRounds] = useState<1 | 2 | 3>(1);

  const [credentials, setCredentials] = useState<RuntimeCredentials>({
    geminiApiKey: "",
    openaiApiKey: "",
    openaiBaseUrl: "",
    cloudflareApiToken: "",
    cloudflareAccountId: "",
    cloudflareCustomUrl: "",
  });

  const [potItems, setPotItems] = useState<PotItem[]>([]);
  const [slots, setSlots] = useState<AgentSlotConfig[]>(() => createDefaultSlots());
  const [executions, setExecutions] = useState<Record<string, AgentSlotExecution>>(() =>
    createInitialExecutions(createDefaultSlots())
  );

  const [synthesizerConfig, setSynthesizerConfig] = useState<{
    provider: ProviderId;
    modelId: string;
    systemPrompt: string;
  }>({
    provider: "gemini",
    modelId: "gemini-4-hydrogen",
    systemPrompt:
      "You are the Round-Table Chair. Synthesize all agent perspectives into a cohesive, non-redundant executive report that resolves disagreements and cites specific slot findings.",
  });
  const [synthesisOutput, setSynthesisOutput] = useState<AgentSlotExecution | null>(null);
  const [executionLogs, setExecutionLogs] = useState<ExecutionLogEntry[]>([]);
  const [isWorkspaceRunning, setIsWorkspaceRunning] = useState(false);
  const [workspacePhaseText, setWorkspacePhaseText] = useState<string>("");

  const abortMapRef = useRef<Record<string, AbortController>>({});
  const workspaceAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d: { hasServerGeminiKey?: boolean }) => {
        setHasServerGeminiKey(Boolean(d.hasServerGeminiKey));
      })
      .catch(() => {});
  }, []);

  const activeSlots = slots.slice(0, slotCount);

  function updateSlot(updated: AgentSlotConfig) {
    setSlots((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }

  function applySplitPreset(preset: "2v2" | "2v3" | "3v2") {
    if (preset === "2v2") {
      setSlotCount(4);
      setSlots((prev) =>
        prev.map((s, idx) => ({ ...s, team: idx < 2 ? "A" : "B" }))
      );
    } else if (preset === "2v3") {
      setSlotCount(5);
      setSlots((prev) =>
        prev.map((s, idx) => ({ ...s, team: idx < 2 ? "A" : "B" }))
      );
    } else {
      setSlotCount(5);
      setSlots((prev) =>
        prev.map((s, idx) => ({ ...s, team: idx < 3 ? "A" : "B" }))
      );
    }
  }

  async function runSingleSlot(
    slot: AgentSlotConfig,
    options?: { peerContext?: string; round?: number; phase?: string }
  ): Promise<{ text: string; error?: string }> {
    abortMapRef.current[slot.id]?.abort();
    const controller = new AbortController();
    abortMapRef.current[slot.id] = controller;

    const startedAt = Date.now();
    setExecutions((prev) => ({
      ...prev,
      [slot.id]: {
        slotId: slot.id,
        status: "streaming",
        phaseLabel: options?.phase || "Connecting to provider...",
        outputText: "",
        mediaAssets: [],
        startedAt,
        roundNumber: options?.round ?? 1,
      },
    }));

    try {
      const result = await executeAgentStream({
        slot,
        credentials,
        potItems,
        peerContext: options?.peerContext,
        signal: controller.signal,
        callbacks: {
          onStatus: (message) => {
            setExecutions((prev) => ({
              ...prev,
              [slot.id]: { ...prev[slot.id], phaseLabel: message },
            }));
          },
          onDelta: (delta) => {
            setExecutions((prev) => ({
              ...prev,
              [slot.id]: {
                ...prev[slot.id],
                outputText: (prev[slot.id]?.outputText ?? "") + delta,
              },
            }));
          },
          onMedia: (asset) => {
            setExecutions((prev) => ({
              ...prev,
              [slot.id]: {
                ...prev[slot.id],
                mediaAssets: [...(prev[slot.id]?.mediaAssets ?? []), asset],
              },
            }));
          },
        },
      });

      const completedAt = Date.now();
      const durationMs = completedAt - startedAt;

      setExecutions((prev) => ({
        ...prev,
        [slot.id]: {
          ...prev[slot.id],
          status: "completed",
          phaseLabel: options?.phase ? `${options.phase} · Done` : "Completed",
          completedAt,
          durationMs,
        },
      }));

      setExecutionLogs((prev) => [
        ...prev,
        {
          id: `log-${Date.now()}-${slot.id}`,
          timestamp: completedAt,
          round: options?.round ?? 1,
          phase: options?.phase || (topology === "round-table" ? "Round-Table Parallel" : `Table ${slot.team}`),
          topology,
          slotId: slot.id,
          slotLabel: slot.label,
          team: topology === "split-table" ? slot.team : undefined,
          provider: slot.provider,
          modelId: slot.modelId,
          outputText: result.text,
          mediaCount: result.mediaAssets.length,
          durationMs,
        },
      ]);

      return { text: result.text };
    } catch (err) {
      const aborted = controller.signal.aborted;
      const message = aborted ? "Aborted by user" : err instanceof Error ? err.message : String(err);
      const completedAt = Date.now();

      setExecutions((prev) => ({
        ...prev,
        [slot.id]: {
          ...prev[slot.id],
          status: aborted ? "aborted" : "error",
          errorMessage: aborted ? undefined : message,
          phaseLabel: aborted ? "Aborted" : "Failed",
          completedAt,
          durationMs: completedAt - startedAt,
        },
      }));

      if (!aborted) {
        setExecutionLogs((prev) => [
          ...prev,
          {
            id: `log-${Date.now()}-${slot.id}`,
            timestamp: completedAt,
            round: options?.round ?? 1,
            phase: options?.phase || "Error",
            topology,
            slotId: slot.id,
            slotLabel: slot.label,
            team: topology === "split-table" ? slot.team : undefined,
            provider: slot.provider,
            modelId: slot.modelId,
            outputText: "",
            mediaCount: 0,
            error: message,
          },
        ]);
      }

      return { text: "", error: message };
    }
  }

  function stopSlot(slotId: string) {
    abortMapRef.current[slotId]?.abort();
  }

  function stopAll() {
    workspaceAbortRef.current?.abort();
    for (const ctrl of Object.values(abortMapRef.current)) {
      ctrl.abort();
    }
    setIsWorkspaceRunning(false);
    setWorkspacePhaseText("Stopped");
  }

  async function runSynthesisPass(peerOutputs: Array<{ label: string; modelId: string; text: string }>) {
    const controller = new AbortController();
    abortMapRef.current["synthesis"] = controller;
    const startedAt = Date.now();

    setSynthesisOutput({
      slotId: "synthesis",
      status: "streaming",
      phaseLabel: "Synthesizing peer findings...",
      outputText: "",
      mediaAssets: [],
      startedAt,
    });

    const peerContext = peerOutputs
      .map((p) => `### ${p.label} (${p.modelId})\n${p.text || "_No text output_"}`)
      .join("\n\n---\n\n");

    try {
      const result = await executeAgentStream({
        slot: {
          provider: synthesizerConfig.provider,
          modelId: synthesizerConfig.modelId,
          systemPrompt: synthesizerConfig.systemPrompt,
          taskDirective:
            "Cross-reference all Round-Table peer agent findings above alongside the Central Data Pot, resolve contradictions, and produce a unified synthesis.",
        },
        credentials,
        potItems,
        peerContext,
        signal: controller.signal,
        callbacks: {
          onStatus: (msg) =>
            setSynthesisOutput((prev) => (prev ? { ...prev, phaseLabel: msg } : prev)),
          onDelta: (delta) =>
            setSynthesisOutput((prev) =>
              prev ? { ...prev, outputText: prev.outputText + delta } : prev
            ),
          onMedia: (asset) =>
            setSynthesisOutput((prev) =>
              prev ? { ...prev, mediaAssets: [...prev.mediaAssets, asset] } : prev
            ),
        },
      });

      const completedAt = Date.now();
      setSynthesisOutput((prev) =>
        prev
          ? {
              ...prev,
              status: "completed",
              phaseLabel: "Unified Synthesis Complete",
              completedAt,
              durationMs: completedAt - startedAt,
            }
          : prev
      );

      setExecutionLogs((prev) => [
        ...prev,
        {
          id: `log-syn-${Date.now()}`,
          timestamp: completedAt,
          round: 2,
          phase: "Round-Table Unified Synthesis",
          topology: "round-table",
          slotId: "synthesis",
          slotLabel: "Round-Table Chair",
          provider: synthesizerConfig.provider,
          modelId: synthesizerConfig.modelId,
          outputText: result.text,
          mediaCount: result.mediaAssets.length,
          durationMs: completedAt - startedAt,
        },
      ]);
    } catch (err) {
      const aborted = controller.signal.aborted;
      const message = aborted ? "Aborted" : err instanceof Error ? err.message : String(err);
      setSynthesisOutput((prev) =>
        prev
          ? {
              ...prev,
              status: aborted ? "aborted" : "error",
              errorMessage: aborted ? undefined : message,
              phaseLabel: aborted ? "Aborted" : "Synthesis Failed",
            }
          : prev
      );
    }
  }

  async function executeWorkspace() {
    const enabledSlots = activeSlots.filter((s) => s.enabled && s.modelId.trim());
    if (enabledSlots.length === 0) return;

    const masterAbort = new AbortController();
    workspaceAbortRef.current = masterAbort;
    setIsWorkspaceRunning(true);

    try {
      if (topology === "round-table") {
        setWorkspacePhaseText(
          `Round-Table Phase 1: Running ${enabledSlots.length} concurrent slots...`
        );
        const results = await Promise.all(
          enabledSlots.map(async (slot) => {
            const res = await runSingleSlot(slot, {
              round: 1,
              phase: "Round-Table Parallel",
            });
            return { label: slot.label, modelId: slot.modelId, text: res.text };
          })
        );

        if (enableRoundTableSynthesis && !masterAbort.signal.aborted) {
          setWorkspacePhaseText("Round-Table Phase 2: Cross-referencing peer synthesis...");
          await runSynthesisPass(results);
        }
        setWorkspacePhaseText("Round-Table execution complete");
      } else {
        // Split-Table Mode (Adversarial / Competitive Evaluation)
        const teamASlots = enabledSlots.filter((s) => s.team === "A");
        const teamBSlots = enabledSlots.filter((s) => s.team === "B");

        setWorkspacePhaseText(
          `Phase 1 (Table A Proposal): Executing ${teamASlots.length} slot(s)...`
        );
        let latestTeamAText = (
          await Promise.all(
            teamASlots.map(async (slot) => {
              const r = await runSingleSlot(slot, {
                round: 1,
                phase: "Phase 1 · Table A Proposal",
              });
              return `### ${slot.label} (${slot.modelId})\n${r.text}`;
            })
          )
        ).join("\n\n");

        if (masterAbort.signal.aborted) return;

        setWorkspacePhaseText(
          `Phase 2 (Table B Critique): Auditing Table A outputs across ${teamBSlots.length} slot(s)...`
        );
        let latestTeamBText = (
          await Promise.all(
            teamBSlots.map(async (slot) => {
              const r = await runSingleSlot(slot, {
                round: 1,
                phase: "Phase 2 · Table B Critique",
                peerContext: `=== TABLE A PROPOSALS (PHASE 1) ===\n${latestTeamAText}`,
              });
              return `### ${slot.label} (${slot.modelId})\n${r.text}`;
            })
          )
        ).join("\n\n");

        if (enableCrossExam && !masterAbort.signal.aborted) {
          for (let round = 1; round <= rebuttalRounds; round++) {
            if (masterAbort.signal.aborted) break;

            setWorkspacePhaseText(
              `Cross-Examination Loop Round ${round}/${rebuttalRounds}: Table A Rebuttal...`
            );
            latestTeamAText = (
              await Promise.all(
                teamASlots.map(async (slot) => {
                  const r = await runSingleSlot(slot, {
                    round: round + 1,
                    phase: `Rebuttal Loop ${round} · Table A`,
                    peerContext: `=== TABLE B CRITIQUE TO REBUT ===\n${latestTeamBText}\n\n=== YOUR PRIOR PROPOSAL ===\n${latestTeamAText}`,
                  });
                  return `### ${slot.label} (Rebuttal R${round})\n${r.text}`;
                })
              )
            ).join("\n\n");

            if (masterAbort.signal.aborted) break;

            setWorkspacePhaseText(
              `Cross-Examination Loop Round ${round}/${rebuttalRounds}: Table B Counter-Audit...`
            );
            latestTeamBText = (
              await Promise.all(
                teamBSlots.map(async (slot) => {
                  const r = await runSingleSlot(slot, {
                    round: round + 1,
                    phase: `Rebuttal Loop ${round} · Table B`,
                    peerContext: `=== TABLE A REBUTTAL (ROUND ${round}) ===\n${latestTeamAText}\n\n=== YOUR PRIOR CRITIQUE ===\n${latestTeamBText}`,
                  });
                  return `### ${slot.label} (Counter-Audit R${round})\n${r.text}`;
                })
              )
            ).join("\n\n");
          }
        }

        setWorkspacePhaseText("Split-Table evaluation complete");
      }
    } finally {
      setIsWorkspaceRunning(false);
    }
  }

  function wipeVolatileSession() {
    stopAll();
    const freshSlots = createDefaultSlots();
    setPotItems([]);
    setSlots(freshSlots);
    setExecutions(createInitialExecutions(freshSlots));
    setSynthesisOutput(null);
    setExecutionLogs([]);
    setWorkspacePhaseText("");
    setCredentials({
      geminiApiKey: "",
      openaiApiKey: "",
      openaiBaseUrl: "",
      cloudflareApiToken: "",
      cloudflareAccountId: "",
      cloudflareCustomUrl: "",
    });
  }

  const teamASlots = activeSlots.filter((s) => s.team === "A");
  const teamBSlots = activeSlots.filter((s) => s.team === "B");

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Zone 1 / 2 / 3 Top Bar Contract */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur-sm">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
          <a
            href="#workspace-top"
            className="text-lg font-bold tracking-tight whitespace-nowrap shrink-0"
            style={{ fontFamily: "var(--font-display)" }}
          >
            PolyTable
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <a
              href="#data-pot"
              className="hover:text-foreground transition-colors whitespace-nowrap shrink-0"
            >
              Data Pot
            </a>
            <a
              href="#agent-slots"
              className="hover:text-foreground transition-colors whitespace-nowrap shrink-0"
            >
              Agent Slots
            </a>
            <a
              href="#transcript-log"
              className="hover:text-foreground transition-colors whitespace-nowrap shrink-0"
            >
              Transcript
            </a>
            <a
              href="#export-engine"
              className="hover:text-foreground transition-colors whitespace-nowrap shrink-0"
            >
              Export
            </a>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            {isWorkspaceRunning ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="whitespace-nowrap shrink-0"
                onClick={stopAll}
              >
                <Square className="h-3.5 w-3.5 mr-1.5" />
                Stop Execution
              </Button>
            ) : (
              <Button
                type="button"
                variant="default"
                size="sm"
                className="whitespace-nowrap shrink-0"
                onClick={() => void executeWorkspace()}
              >
                <Play className="h-3.5 w-3.5 mr-1.5" />
                Run Workspace
              </Button>
            )}
          </div>
        </div>
      </header>

      <main
        id="workspace-top"
        className="flex-1 mx-auto w-full max-w-[1440px] px-4 sm:px-6 py-5 space-y-5"
      >
        {/* Workspace Topology & Volatile Controls Toolbar */}
        <Card>
          <CardContent className="p-4 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <h1 className="text-lg font-semibold tracking-tight text-balance">
                  Multi-Model Orchestration Workspace
                </h1>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    Ephemeral session memory only — zero persistence. Refreshing wipes all files, keys, and outputs.
                  </span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <CredentialsDialog
                  credentials={credentials}
                  onChange={setCredentials}
                  hasServerGeminiKey={hasServerGeminiKey}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="whitespace-nowrap shrink-0"
                  onClick={() => setDarkMode((d) => !d)}
                >
                  {darkMode ? (
                    <Sun className="h-3.5 w-3.5 mr-1.5" />
                  ) : (
                    <Moon className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  {darkMode ? "Light" : "Dark"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive whitespace-nowrap shrink-0"
                  onClick={wipeVolatileSession}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Wipe Memory
                </Button>
              </div>
            </div>

            <Separator />

            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4">
                {/* Topology Selector */}
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">
                    Topology
                  </Label>
                  <ToggleGroup
                    type="single"
                    value={topology}
                    onValueChange={(v) => {
                      if (v === "round-table" || v === "split-table") {
                        setTopology(v);
                      }
                    }}
                  >
                    <ToggleGroupItem value="round-table" className="gap-1.5">
                      <Users className="h-3.5 w-3.5" />
                      Round-Table Synthesis
                    </ToggleGroupItem>
                    <ToggleGroupItem value="split-table" className="gap-1.5">
                      <ArrowLeftRight className="h-3.5 w-3.5" />
                      Split-Table Adversarial
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>

                {/* Slot Count */}
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">
                    Concurrent Slots
                  </Label>
                  <ToggleGroup
                    type="single"
                    value={String(slotCount)}
                    onValueChange={(v) => {
                      if (v === "4") setSlotCount(4);
                      if (v === "5") setSlotCount(5);
                    }}
                  >
                    <ToggleGroupItem value="4">4 Slots</ToggleGroupItem>
                    <ToggleGroupItem value="5">5 Slots</ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </div>

              {/* Mode-Specific Controls */}
              {topology === "round-table" ? (
                <div className="flex items-center gap-2.5">
                  <Switch
                    id="rt-synth"
                    checked={enableRoundTableSynthesis}
                    onCheckedChange={setEnableRoundTableSynthesis}
                  />
                  <Label htmlFor="rt-synth" className="text-xs cursor-pointer">
                    Run Phase 2 Unified Synthesis Pass
                  </Label>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs text-muted-foreground">Split</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs font-mono"
                      onClick={() => applySplitPreset("2v2")}
                    >
                      2v2
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs font-mono"
                      onClick={() => applySplitPreset("2v3")}
                    >
                      2v3
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs font-mono"
                      onClick={() => applySplitPreset("3v2")}
                    >
                      3v2
                    </Button>
                  </div>

                  <Separator orientation="vertical" className="h-5" />

                  <div className="flex items-center gap-2">
                    <Switch
                      id="cross-exam"
                      checked={enableCrossExam}
                      onCheckedChange={setEnableCrossExam}
                    />
                    <Label htmlFor="cross-exam" className="text-xs cursor-pointer">
                      Cross-Exam Loop
                    </Label>
                  </div>

                  {enableCrossExam && (
                    <Select
                      value={String(rebuttalRounds)}
                      onValueChange={(v) => setRebuttalRounds(Number(v) as 1 | 2 | 3)}
                    >
                      <SelectTrigger className="h-7 w-[110px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 Rebuttal</SelectItem>
                        <SelectItem value="2">2 Rebuttals</SelectItem>
                        <SelectItem value="3">3 Rebuttals</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </div>

            {workspacePhaseText && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{workspacePhaseText}</span>
                  <span className="font-mono text-muted-foreground tabular-nums">
                    {isWorkspaceRunning ? "Running" : "Idle"}
                  </span>
                </div>
                {isWorkspaceRunning && <Progress value={60} />}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Central Shared Data Pot */}
        <section id="data-pot">
          <CentralDataPot
            items={potItems}
            onAddItems={(added) => setPotItems((prev) => [...prev, ...added])}
            onRemoveItem={(id) =>
              setPotItems((prev) => prev.filter((item) => item.id !== id))
            }
            onClearAll={() => setPotItems([])}
          />
        </section>

        {/* Agent Slots Grid grouped by Topology */}
        <section id="agent-slots" className="space-y-5">
          {topology === "round-table" ? (
            <>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <h2 className="text-base font-semibold">
                    Round-Table Concurrent Slots ({activeSlots.length})
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    All slots ingest the Central Data Pot in parallel and cross-reference findings in Phase 2 synthesis.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {activeSlots.map((slot) => (
                  <AgentSlotCard
                    key={slot.id}
                    slot={slot}
                    execution={executions[slot.id] ?? createEmptyExecution(slot.id)}
                    topology={topology}
                    onUpdateSlot={updateSlot}
                    onRunSlot={(id) => {
                      const target = slots.find((s) => s.id === id);
                      if (target) void runSingleSlot(target);
                    }}
                    onStopSlot={stopSlot}
                  />
                ))}
              </div>

              {/* Round-Table Collaborative Synthesis Hub */}
              {enableRoundTableSynthesis && (
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                          <Layers className="h-4 w-4" />
                          Round-Table Unified Synthesis Output
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Cross-references outputs from all active Round-Table slots alongside the Data Pot.
                        </CardDescription>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs whitespace-nowrap"
                        disabled={isWorkspaceRunning}
                        onClick={() => {
                          const currentPeers = activeSlots.map((s) => ({
                            label: s.label,
                            modelId: s.modelId,
                            text: executions[s.id]?.outputText || "",
                          }));
                          void runSynthesisPass(currentPeers);
                        }}
                      >
                        <Play className="h-3.5 w-3.5 mr-1.5" />
                        Synthesize Current Outputs
                      </Button>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label>Chair Provider</Label>
                        <Select
                          value={synthesizerConfig.provider}
                          onValueChange={(v) =>
                            setSynthesizerConfig((c) => ({
                              ...c,
                              provider: v as ProviderId,
                            }))
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
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
                        <Label>Chair Raw Model ID</Label>
                        <Input
                          value={synthesizerConfig.modelId}
                          onChange={(e) =>
                            setSynthesizerConfig((c) => ({
                              ...c,
                              modelId: e.target.value,
                            }))
                          }
                          className="h-8 font-mono text-xs"
                          placeholder="e.g., gemini-4-hydrogen, gpt-4o"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label>Chair Instructions</Label>
                        <Textarea
                          value={synthesizerConfig.systemPrompt}
                          onChange={(e) =>
                            setSynthesizerConfig((c) => ({
                              ...c,
                              systemPrompt: e.target.value,
                            }))
                          }
                          className="min-h-[32px] h-8 text-xs py-1.5"
                        />
                      </div>
                    </div>

                    {synthesisOutput && (
                      <div className="rounded-md border bg-background p-3">
                        <div className="flex items-center justify-between mb-2">
                          <Badge
                            variant={
                              synthesisOutput.status === "completed"
                                ? "success"
                                : synthesisOutput.status === "error"
                                ? "destructive"
                                : "default"
                            }
                          >
                            {synthesisOutput.phaseLabel || synthesisOutput.status}
                          </Badge>
                          {synthesisOutput.durationMs !== undefined && (
                            <span className="font-mono text-xs text-muted-foreground tabular-nums">
                              {(synthesisOutput.durationMs / 1000).toFixed(2)}s
                            </span>
                          )}
                        </div>
                        <PolymorphicRenderer
                          outputText={synthesisOutput.outputText}
                          mediaAssets={synthesisOutput.mediaAssets}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            /* Split-Table Adversarial Mode */
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
              {/* Table A */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b pb-2">
                  <div>
                    <h2 className="text-base font-semibold">
                      Table A · Extraction & Proposal ({teamASlots.length})
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Phase 1: Analyzes the Central Data Pot to build primary arguments or assets.
                    </p>
                  </div>
                  <Badge variant="outline" className="font-mono">
                    Team A
                  </Badge>
                </div>

                <div className="space-y-4">
                  {teamASlots.map((slot) => (
                    <AgentSlotCard
                      key={slot.id}
                      slot={slot}
                      execution={executions[slot.id] ?? createEmptyExecution(slot.id)}
                      topology={topology}
                      onUpdateSlot={updateSlot}
                      onRunSlot={(id) => {
                        const target = slots.find((s) => s.id === id);
                        if (target) void runSingleSlot(target);
                      }}
                      onStopSlot={stopSlot}
                    />
                  ))}
                </div>
              </div>

              {/* Table B */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b pb-2">
                  <div>
                    <h2 className="text-base font-semibold">
                      Table B · Critique & Counter-Analysis ({teamBSlots.length})
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Phase 2: Audits Data Pot + Table A outputs for flaws, contradictions, or counter-assets.
                    </p>
                  </div>
                  <Badge variant="secondary" className="font-mono">
                    Team B
                  </Badge>
                </div>

                <div className="space-y-4">
                  {teamBSlots.map((slot) => (
                    <AgentSlotCard
                      key={slot.id}
                      slot={slot}
                      execution={executions[slot.id] ?? createEmptyExecution(slot.id)}
                      topology={topology}
                      onUpdateSlot={updateSlot}
                      onRunSlot={(id) => {
                        const target = slots.find((s) => s.id === id);
                        if (target) void runSingleSlot(target);
                      }}
                      onStopSlot={stopSlot}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Execution & Rebuttal Transcript Log */}
        <section id="transcript-log">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold">
                    Execution & Rebuttal Transcript Log
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Chronological volatile audit trail of all Round-Table and Split-Table Table A vs. Table B cycles.
                  </CardDescription>
                </div>
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {executionLogs.length} entries
                </span>
              </div>
            </CardHeader>
            <CardContent>
              {executionLogs.length === 0 ? (
                <div className="rounded-md border border-dashed bg-muted/15 p-6 text-center text-xs text-muted-foreground">
                  No execution rounds logged yet. Click Run Workspace or Run Slot to record live cross-examination and synthesis transcripts.
                </div>
              ) : (
                <ScrollArea className="h-[260px] rounded-md border bg-muted/10 p-3">
                  <div className="space-y-3">
                    {executionLogs.map((entry) => (
                      <Card key={entry.id}>
                        <CardHeader className="py-2.5 px-3">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="font-mono text-[10px]">
                                R{entry.round}
                              </Badge>
                              <span className="font-semibold">{entry.slotLabel}</span>
                              {entry.team && (
                                <Badge variant={entry.team === "A" ? "default" : "secondary"}>
                                  Table {entry.team}
                                </Badge>
                              )}
                              <span className="text-muted-foreground">· {entry.phase}</span>
                            </div>
                            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                              {entry.provider} · {entry.modelId}
                              {entry.durationMs !== undefined
                                ? ` · ${(entry.durationMs / 1000).toFixed(2)}s`
                                : ""}
                            </span>
                          </div>
                        </CardHeader>
                        <CardContent className="py-2 px-3 pt-0 text-xs text-muted-foreground">
                          {entry.error ? (
                            <span className="text-destructive">{entry.error}</span>
                          ) : (
                            <p className="line-clamp-3 whitespace-pre-wrap">
                              {entry.outputText || `[${entry.mediaCount} media asset(s) generated]`}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Friction-Free Session Export Bar */}
        <section id="export-engine">
          <ExportBar
            topology={topology}
            slots={activeSlots}
            executions={executions}
            potItems={potItems}
            executionLogs={executionLogs}
            synthesisOutput={synthesisOutput}
          />
        </section>
      </main>
    </div>
  );
}
