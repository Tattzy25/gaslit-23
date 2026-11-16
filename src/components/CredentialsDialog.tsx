import { useState } from "react";
import { Eye, EyeOff, KeyRound, ShieldAlert } from "lucide-react";
import { RuntimeCredentials } from "@/src/types/orchestrator";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Separator } from "@/src/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/tabs";

interface CredentialsDialogProps {
  credentials: RuntimeCredentials;
  onChange: (next: RuntimeCredentials) => void;
  hasServerGeminiKey: boolean;
}

export function CredentialsDialog({
  credentials,
  onChange,
  hasServerGeminiKey,
}: CredentialsDialogProps) {
  const [open, setOpen] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);

  const configuredCount = [
    credentials.geminiApiKey || (hasServerGeminiKey ? "env" : ""),
    credentials.openaiApiKey,
    credentials.cloudflareApiToken && credentials.cloudflareAccountId ? "cf" : "",
  ].filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 whitespace-nowrap shrink-0">
          <KeyRound className="h-3.5 w-3.5" />
          <span>API Keys</span>
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            ({configuredCount}/3)
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>Runtime Provider Credentials</DialogTitle>
          <DialogDescription>
            Raw unvalidated strings passed directly to provider API headers and payloads. Stored strictly in volatile client memory and wiped on refresh.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
            <span>Zero persistence: no cookies, localStorage, or database writes.</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setShowSecrets((v) => !v)}
          >
            {showSecrets ? <EyeOff className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
            {showSecrets ? "Mask" : "Reveal"}
          </Button>
        </div>

        <Tabs defaultValue="gemini" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="gemini">Google Gemini</TabsTrigger>
            <TabsTrigger value="cloudflare">Cloudflare AI</TabsTrigger>
            <TabsTrigger value="openai">OpenAI</TabsTrigger>
          </TabsList>

          <TabsContent value="gemini" className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="gemini-key">Gemini API Key (Runtime Override)</Label>
              <Input
                id="gemini-key"
                type={showSecrets ? "text" : "password"}
                placeholder={
                  hasServerGeminiKey
                    ? "Leave blank to use server-configured key, or paste raw key..."
                    : "AIza... (passed directly as raw string)"
                }
                value={credentials.geminiApiKey}
                onChange={(e) =>
                  onChange({ ...credentials, geminiApiKey: e.target.value })
                }
                className="font-mono text-xs"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                {hasServerGeminiKey
                  ? "Server environment Gemini key is active as fallback when this input is empty."
                  : "Enter a Gemini API key to route Gemini agent slots."}
              </p>
            </div>
          </TabsContent>

          <TabsContent value="cloudflare" className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="cf-account">Cloudflare Account ID</Label>
              <Input
                id="cf-account"
                type="text"
                placeholder="Raw Cloudflare Account ID"
                value={credentials.cloudflareAccountId}
                onChange={(e) =>
                  onChange({ ...credentials, cloudflareAccountId: e.target.value })
                }
                className="font-mono text-xs"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cf-token">Cloudflare Workers AI API Token</Label>
              <Input
                id="cf-token"
                type={showSecrets ? "text" : "password"}
                placeholder="Bearer token string"
                value={credentials.cloudflareApiToken}
                onChange={(e) =>
                  onChange({ ...credentials, cloudflareApiToken: e.target.value })
                }
                className="font-mono text-xs"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cf-url">Optional Custom Endpoint Override</Label>
              <Input
                id="cf-url"
                type="text"
                placeholder="https://api.cloudflare.com/client/v4/accounts/{id}/ai/run/{model}"
                value={credentials.cloudflareCustomUrl}
                onChange={(e) =>
                  onChange({ ...credentials, cloudflareCustomUrl: e.target.value })
                }
                className="font-mono text-xs"
                autoComplete="off"
              />
            </div>
          </TabsContent>

          <TabsContent value="openai" className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="oai-key">OpenAI API Key</Label>
              <Input
                id="oai-key"
                type={showSecrets ? "text" : "password"}
                placeholder="sk-... (raw unvalidated string)"
                value={credentials.openaiApiKey}
                onChange={(e) =>
                  onChange({ ...credentials, openaiApiKey: e.target.value })
                }
                className="font-mono text-xs"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="oai-base">Base URL (Optional OpenAI-Compatible Endpoint)</Label>
              <Input
                id="oai-base"
                type="text"
                placeholder="https://api.openai.com/v1"
                value={credentials.openaiBaseUrl}
                onChange={(e) =>
                  onChange({ ...credentials, openaiBaseUrl: e.target.value })
                }
                className="font-mono text-xs"
                autoComplete="off"
              />
            </div>
          </TabsContent>
        </Tabs>

        <Separator />

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              onChange({
                geminiApiKey: "",
                openaiApiKey: "",
                openaiBaseUrl: "",
                cloudflareApiToken: "",
                cloudflareAccountId: "",
                cloudflareCustomUrl: "",
              })
            }
          >
            Clear All Keys
          </Button>
          <Button type="button" size="sm" onClick={() => setOpen(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
