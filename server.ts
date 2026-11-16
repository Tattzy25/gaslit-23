import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface PotItemPayload {
  id: string;
  name: string;
  mimeType: string;
  kind: "text" | "image" | "audio" | "video" | "pdf";
  textContent?: string;
  base64Data?: string;
}

interface OrchestrateRequestBody {
  provider: "gemini" | "cloudflare" | "openai";
  modelId: string;
  apiKey?: string;
  accountId?: string;
  baseUrl?: string;
  systemPrompt?: string;
  taskDirective?: string;
  potItems?: PotItemPayload[];
  peerContext?: string;
}

function pcmToWavBuffer(pcmBuffer: Buffer, sampleRate = 24000, channels = 1, bitsPerSample = 16): Buffer {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcmBuffer.length, 40);
  return Buffer.concat([header, pcmBuffer]);
}

function buildTextPrompt(body: OrchestrateRequestBody): string {
  const segments: string[] = [];
  const potItems = body.potItems ?? [];

  if (potItems.length > 0) {
    segments.push("=== CENTRAL SHARED DATA POT ===");
    for (const item of potItems) {
      if (item.textContent !== undefined) {
        segments.push(`\n[Asset: ${item.name} | MIME: ${item.mimeType}]\n${item.textContent}`);
      } else {
        segments.push(`\n[Binary Multimodal Asset: ${item.name} | MIME: ${item.mimeType} | Kind: ${item.kind}]`);
      }
    }
  }

  if (body.peerContext && body.peerContext.trim()) {
    segments.push(`\n=== CROSS-AGENT / TABLE CONTEXT ===\n${body.peerContext}`);
  }

  segments.push(
    `\n=== TASK DIRECTIVE ===\n${
      body.taskDirective && body.taskDirective.trim()
        ? body.taskDirective
        : "Analyze all assets in the shared data pot and deliver a structured synthesis."
    }`
  );

  return segments.join("\n");
}

function createSseEmitter(res: express.Response) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  return (event: Record<string, unknown>) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  };
}

async function handleGemini(
  body: OrchestrateRequestBody,
  emit: (event: Record<string, unknown>) => void,
  signal: AbortSignal
) {
  const effectiveKey = body.apiKey && body.apiKey.trim() ? body.apiKey.trim() : process.env.GEMINI_API_KEY;
  if (!effectiveKey) {
    throw new Error(
      "Missing Gemini API key. Provide one in Runtime Credentials or configure GEMINI_API_KEY on the server."
    );
  }

  const modelId = body.modelId; // Unvalidated raw string
  if (!modelId) {
    throw new Error("Model ID is empty.");
  }

  const ai = new GoogleGenAI({
    apiKey: effectiveKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });

  const potItems = body.potItems ?? [];
  const parts: Array<Record<string, unknown>> = [];

  for (const item of potItems) {
    if (item.textContent !== undefined) {
      parts.push({
        text: `[Shared Pot Text Asset: ${item.name} (${item.mimeType})]\n${item.textContent}`,
      });
    } else if (item.base64Data) {
      parts.push({
        text: `[Shared Pot Media Asset: ${item.name} (${item.mimeType})]`,
      });
      parts.push({
        inlineData: {
          mimeType: item.mimeType || "application/octet-stream",
          data: item.base64Data,
        },
      });
    }
  }

  if (body.peerContext && body.peerContext.trim()) {
    parts.push({
      text: `[Cross-Agent / Table Context]\n${body.peerContext}`,
    });
  }

  const directiveText =
    body.taskDirective && body.taskDirective.trim()
      ? body.taskDirective
      : "Analyze all shared data pot inputs and fulfill your role.";
  parts.push({ text: directiveText });

  const lower = modelId.toLowerCase();

  // 1. Imagen dedicated endpoint
  if (lower.startsWith("imagen")) {
    emit({ type: "status", message: `Generating image via ${modelId}...` });
    const result = await ai.models.generateImages({
      model: modelId,
      prompt: buildTextPrompt(body),
    });
    const images = result.generatedImages ?? [];
    for (let i = 0; i < images.length; i++) {
      const b64 = images[i]?.image?.imageBytes;
      if (b64) {
        emit({
          type: "media",
          asset: {
            id: `img-${Date.now()}-${i}`,
            kind: "image",
            mimeType: "image/png",
            dataUrl: `data:image/png;base64,${b64}`,
            filename: `${modelId.replace(/[^a-z0-9_-]/gi, "_")}_${i + 1}.png`,
          },
        });
      }
    }
    emit({ type: "delta", text: `Generated ${images.length} image(s) with \`${modelId}\`.` });
    return;
  }

  // 2. Gemini / Nano Banana image generation models
  if (lower.includes("image") || lower.includes("nano-banana")) {
    emit({ type: "status", message: `Generating image content via ${modelId}...` });
    const response = await ai.models.generateContent({
      model: modelId,
      contents: { parts: parts as never },
      config: body.systemPrompt?.trim()
        ? { systemInstruction: body.systemPrompt }
        : undefined,
    });

    const respParts = response.candidates?.[0]?.content?.parts ?? [];
    let imgCount = 0;
    for (const p of respParts) {
      if (p.inlineData?.data) {
        imgCount++;
        const mime = p.inlineData.mimeType || "image/png";
        const ext = mime.split("/")[1]?.split(";")[0] || "png";
        emit({
          type: "media",
          asset: {
            id: `img-${Date.now()}-${imgCount}`,
            kind: "image",
            mimeType: mime,
            dataUrl: `data:${mime};base64,${p.inlineData.data}`,
            filename: `generated_image_${imgCount}.${ext}`,
          },
        });
      } else if (p.text) {
        emit({ type: "delta", text: p.text });
      }
    }
    if (imgCount === 0 && response.text) {
      emit({ type: "delta", text: response.text });
    }
    return;
  }

  // 3. Lyria music generation models
  if (lower.startsWith("lyria")) {
    emit({ type: "status", message: `Streaming audio composition via ${modelId}...` });
    const stream = await ai.models.generateContentStream({
      model: modelId,
      contents: { parts: parts as never },
    });

    const audioChunks: Buffer[] = [];
    let audioMime = "audio/mpeg";
    for await (const chunk of stream) {
      if (signal.aborted) break;
      const chunkParts = chunk.candidates?.[0]?.content?.parts ?? [];
      for (const p of chunkParts) {
        if (p.inlineData?.data) {
          if (audioChunks.length === 0 && p.inlineData.mimeType) {
            audioMime = p.inlineData.mimeType;
          }
          audioChunks.push(Buffer.from(p.inlineData.data, "base64"));
        }
        if (p.text) {
          emit({ type: "delta", text: p.text });
        }
      }
    }

    if (audioChunks.length > 0) {
      const fullB64 = Buffer.concat(audioChunks).toString("base64");
      const ext = audioMime.includes("wav") ? "wav" : "mp3";
      emit({
        type: "media",
        asset: {
          id: `aud-${Date.now()}`,
          kind: "audio",
          mimeType: audioMime,
          dataUrl: `data:${audioMime};base64,${fullB64}`,
          filename: `lyria_track.${ext}`,
        },
      });
    }
    return;
  }

  // 4. Gemini TTS models
  if (lower.includes("-tts")) {
    emit({ type: "status", message: `Synthesizing speech via ${modelId}...` });
    const response = await ai.models.generateContent({
      model: modelId,
      contents: { parts: parts as never },
      config: {
        ...(body.systemPrompt?.trim() ? { systemInstruction: body.systemPrompt } : {}),
        responseModalities: ["AUDIO"],
      },
    });
    const respParts = response.candidates?.[0]?.content?.parts ?? [];
    let audioCount = 0;
    for (const p of respParts) {
      if (p.inlineData?.data) {
        audioCount++;
        const rawMime = p.inlineData.mimeType || "audio/pcm";
        let finalMime = rawMime;
        let finalB64 = p.inlineData.data;
        if (rawMime.includes("pcm") || rawMime.includes("L16")) {
          const wavBuf = pcmToWavBuffer(Buffer.from(p.inlineData.data, "base64"));
          finalB64 = wavBuf.toString("base64");
          finalMime = "audio/wav";
        }
        const ext = finalMime.includes("wav") ? "wav" : "mp3";
        emit({
          type: "media",
          asset: {
            id: `tts-${Date.now()}-${audioCount}`,
            kind: "audio",
            mimeType: finalMime,
            dataUrl: `data:${finalMime};base64,${finalB64}`,
            filename: `speech_output_${audioCount}.${ext}`,
          },
        });
      } else if (p.text) {
        emit({ type: "delta", text: p.text });
      }
    }
    if (audioCount > 0) {
      emit({ type: "delta", text: `Synthesized ${audioCount} audio clip(s) using \`${modelId}\`.` });
    }
    return;
  }

  // 5. Video generation via Gemini Interactions API (gemini-omni-*)
  if (lower.includes("omni") && !lower.includes("flash-lite")) {
    emit({ type: "status", message: `Starting video generation via ${modelId}...` });
    const interactionInput: Array<Record<string, unknown>> = [
      { type: "text", text: buildTextPrompt(body) },
    ];
    for (const item of potItems) {
      if (item.kind === "image" && item.base64Data) {
        interactionInput.push({
          type: "image",
          data: item.base64Data,
          mime_type: item.mimeType,
        });
      }
    }
    const created = await ai.interactions.create({
      model: modelId,
      input: interactionInput as never,
      background: true,
      store: false,
      response_format: {
        type: "video",
        aspect_ratio: "16:9",
      },
    });
    let current = created;
    let polls = 0;
    while (
      current.status !== "completed" &&
      current.status !== "failed" &&
      current.status !== "cancelled" &&
      polls < 60 &&
      !signal.aborted
    ) {
      await new Promise((r) => setTimeout(r, 3000));
      polls++;
      emit({ type: "status", message: `Rendering video (${current.status})...` });
      current = await ai.interactions.get(current.id);
    }
    if (current.status === "failed") {
      throw new Error("Video interaction failed.");
    }
    const videoPart = current.output_video;
    if (videoPart?.data) {
      const mime = videoPart.mime_type || "video/mp4";
      emit({
        type: "media",
        asset: {
          id: `vid-${Date.now()}`,
          kind: "video",
          mimeType: mime,
          dataUrl: `data:${mime};base64,${videoPart.data}`,
          filename: `generated_video.mp4`,
        },
      });
    }
    emit({ type: "delta", text: `Completed video generation via \`${modelId}\`.` });
    return;
  }

  // 6. Standard streaming multimodal content generation (default for all reasoning/vision/transcription/custom strings)
  emit({ type: "status", message: `Streaming from ${modelId}...` });
  const stream = await ai.models.generateContentStream({
    model: modelId,
    contents: { parts: parts as never },
    config: body.systemPrompt?.trim()
      ? { systemInstruction: body.systemPrompt }
      : undefined,
  });

  for await (const chunk of stream) {
    if (signal.aborted) break;
    if (chunk.text) {
      emit({ type: "delta", text: chunk.text });
    }
    const chunkParts = chunk.candidates?.[0]?.content?.parts ?? [];
    for (const p of chunkParts) {
      if (p.inlineData?.data) {
        const mime = p.inlineData.mimeType || "application/octet-stream";
        const kind = mime.startsWith("image/")
          ? "image"
          : mime.startsWith("audio/")
          ? "audio"
          : mime.startsWith("video/")
          ? "video"
          : null;
        if (kind) {
          const ext = mime.split("/")[1]?.split(";")[0] || "bin";
          emit({
            type: "media",
            asset: {
              id: `asset-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              kind,
              mimeType: mime,
              dataUrl: `data:${mime};base64,${p.inlineData.data}`,
              filename: `output_${kind}.${ext}`,
            },
          });
        }
      }
    }
  }
}

async function handleCloudflare(
  body: OrchestrateRequestBody,
  emit: (event: Record<string, unknown>) => void,
  signal: AbortSignal
) {
  const modelId = body.modelId; // Unvalidated raw string
  const apiKey = body.apiKey ?? "";
  const accountId = body.accountId ?? "";
  const customUrl = body.baseUrl?.trim();

  if (!modelId) throw new Error("Model ID is required.");
  if (!customUrl && !accountId) {
    throw new Error("Cloudflare Account ID (or Custom Endpoint URL) is required.");
  }
  if (!apiKey) {
    throw new Error("Cloudflare API Token is required.");
  }

  const endpoint = customUrl
    ? customUrl
    : `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${modelId}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const lower = modelId.toLowerCase();
  const potItems = body.potItems ?? [];
  const textPrompt = buildTextPrompt(body);

  // Image generation models on Cloudflare Workers AI (Flux, SDXL, DreamShaper, etc.)
  if (
    lower.includes("flux") ||
    lower.includes("stable-diffusion") ||
    lower.includes("sdxl") ||
    lower.includes("dreamshaper")
  ) {
    emit({ type: "status", message: `Invoking Cloudflare image model ${modelId}...` });
    const resp = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ prompt: textPrompt }),
      signal,
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Cloudflare API ${resp.status}: ${errText}`);
    }

    const ct = resp.headers.get("content-type") || "";
    if (ct.startsWith("image/")) {
      const buf = Buffer.from(await resp.arrayBuffer());
      const ext = ct.split("/")[1]?.split(";")[0] || "png";
      emit({
        type: "media",
        asset: {
          id: `cf-img-${Date.now()}`,
          kind: "image",
          mimeType: ct,
          dataUrl: `data:${ct};base64,${buf.toString("base64")}`,
          filename: `cloudflare_image.${ext}`,
        },
      });
      emit({ type: "delta", text: `Generated image using \`${modelId}\`.` });
      return;
    }

    const json = (await resp.json()) as {
      result?: { image?: string };
      errors?: Array<{ message: string }>;
      success?: boolean;
    };
    if (json.success === false) {
      throw new Error(json.errors?.map((e) => e.message).join("; ") || "Cloudflare error");
    }
    if (json.result?.image) {
      emit({
        type: "media",
        asset: {
          id: `cf-img-${Date.now()}`,
          kind: "image",
          mimeType: "image/png",
          dataUrl: `data:image/png;base64,${json.result.image}`,
          filename: `cloudflare_image.png`,
        },
      });
      emit({ type: "delta", text: `Generated image using \`${modelId}\`.` });
      return;
    }
    emit({ type: "delta", text: JSON.stringify(json, null, 2) });
    return;
  }

  // Audio transcription models (Whisper, Deepgram)
  if (lower.includes("whisper") || lower.includes("deepgram")) {
    const audioItem = potItems.find((p) => p.kind === "audio" && p.base64Data);
    if (!audioItem || !audioItem.base64Data) {
      throw new Error("Whisper/transcription model selected, but no audio file is present in the Data Pot.");
    }
    emit({ type: "status", message: `Transcribing audio via Cloudflare ${modelId}...` });
    const bytes = Array.from(Buffer.from(audioItem.base64Data, "base64"));
    const resp = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ audio: bytes }),
      signal,
    });
    if (!resp.ok) {
      throw new Error(`Cloudflare API ${resp.status}: ${await resp.text()}`);
    }
    const json = (await resp.json()) as { result?: { text?: string } };
    emit({ type: "delta", text: json.result?.text ?? JSON.stringify(json, null, 2) });
    return;
  }

  // Standard text / vision LLM on Cloudflare Workers AI
  emit({ type: "status", message: `Executing Cloudflare model ${modelId}...` });
  const imageItem = potItems.find((p) => p.kind === "image" && p.base64Data);
  const payload: Record<string, unknown> = {
    messages: [
      ...(body.systemPrompt?.trim() ? [{ role: "system", content: body.systemPrompt }] : []),
      { role: "user", content: textPrompt },
    ],
    stream: true,
  };

  if (imageItem?.base64Data && (lower.includes("llava") || lower.includes("vision"))) {
    payload.image = Array.from(Buffer.from(imageItem.base64Data, "base64"));
    payload.prompt = textPrompt;
  }

  const resp = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal,
  });

  if (!resp.ok) {
    throw new Error(`Cloudflare API ${resp.status}: ${await resp.text()}`);
  }

  const ct = resp.headers.get("content-type") || "";
  if (ct.includes("text/event-stream") && resp.body) {
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const dataStr = trimmed.slice(5).trim();
        if (dataStr === "[DONE]") continue;
        try {
          const parsed = JSON.parse(dataStr) as {
            response?: string;
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const chunkText = parsed.response ?? parsed.choices?.[0]?.delta?.content;
          if (chunkText) emit({ type: "delta", text: chunkText });
        } catch {
          // ignore partial SSE frames
        }
      }
    }
    return;
  }

  const json = (await resp.json()) as {
    result?: { response?: string; description?: string };
    choices?: Array<{ message?: { content?: string } }>;
    errors?: Array<{ message: string }>;
    success?: boolean;
  };
  if (json.success === false) {
    throw new Error(json.errors?.map((e) => e.message).join("; ") || "Cloudflare Workers AI error");
  }
  const text =
    json.result?.response ??
    json.result?.description ??
    json.choices?.[0]?.message?.content ??
    JSON.stringify(json, null, 2);
  emit({ type: "delta", text });
}

async function handleOpenAI(
  body: OrchestrateRequestBody,
  emit: (event: Record<string, unknown>) => void,
  signal: AbortSignal
) {
  const modelId = body.modelId; // Unvalidated raw string
  const apiKey = body.apiKey ?? "";
  const baseUrl =
    body.baseUrl && body.baseUrl.trim()
      ? body.baseUrl.trim().replace(/\/+$/, "")
      : "https://api.openai.com/v1";

  if (!modelId) throw new Error("Model ID is required.");
  if (!apiKey) throw new Error("OpenAI API key is required.");

  const lower = modelId.toLowerCase();
  const potItems = body.potItems ?? [];
  const textPrompt = buildTextPrompt(body);

  // 1. Image Generation (dall-e-*, gpt-image-*)
  if (lower.includes("dall-e") || lower.includes("gpt-image")) {
    emit({ type: "status", message: `Generating image via ${modelId}...` });
    const resp = await fetch(`${baseUrl}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        prompt: textPrompt.slice(0, 4000),
        n: 1,
        ...(lower.includes("dall-e") ? { response_format: "b64_json" } : {}),
      }),
      signal,
    });
    if (!resp.ok) {
      throw new Error(`OpenAI Images API ${resp.status}: ${await resp.text()}`);
    }
    const json = (await resp.json()) as {
      data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
    };
    const item = json.data?.[0];
    if (item?.b64_json) {
      emit({
        type: "media",
        asset: {
          id: `oai-img-${Date.now()}`,
          kind: "image",
          mimeType: "image/png",
          dataUrl: `data:image/png;base64,${item.b64_json}`,
          filename: `openai_image.png`,
        },
      });
    } else if (item?.url) {
      emit({
        type: "media",
        asset: {
          id: `oai-img-${Date.now()}`,
          kind: "image",
          mimeType: "image/png",
          dataUrl: item.url,
          filename: `openai_image.png`,
        },
      });
    }
    emit({
      type: "delta",
      text: item?.revised_prompt
        ? `Generated image with \`${modelId}\`.\n\n**Revised Prompt:** ${item.revised_prompt}`
        : `Generated image with \`${modelId}\`.`,
    });
    return;
  }

  // 2. Audio TTS (tts-1, tts-1-hd, gpt-4o-mini-tts)
  if (lower.startsWith("tts-") || lower.includes("-tts")) {
    emit({ type: "status", message: `Synthesizing speech via ${modelId}...` });
    const resp = await fetch(`${baseUrl}/audio/speech`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        input: textPrompt.slice(0, 4096),
        voice: "alloy",
      }),
      signal,
    });
    if (!resp.ok) {
      throw new Error(`OpenAI Speech API ${resp.status}: ${await resp.text()}`);
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    emit({
      type: "media",
      asset: {
        id: `oai-tts-${Date.now()}`,
        kind: "audio",
        mimeType: "audio/mpeg",
        dataUrl: `data:audio/mpeg;base64,${buf.toString("base64")}`,
        filename: `openai_speech.mp3`,
      },
    });
    emit({ type: "delta", text: `Synthesized audio speech using \`${modelId}\`.` });
    return;
  }

  // 3. Audio Transcription (whisper-1, gpt-4o-transcribe)
  if (lower.includes("whisper") || lower.includes("transcribe")) {
    const audioItem = potItems.find((p) => p.kind === "audio" && p.base64Data);
    if (!audioItem || !audioItem.base64Data) {
      throw new Error("Transcription model selected, but no audio file exists in the Data Pot.");
    }
    emit({ type: "status", message: `Transcribing audio via ${modelId}...` });
    const form = new FormData();
    const audioBytes = Buffer.from(audioItem.base64Data, "base64");
    const blob = new Blob([audioBytes], { type: audioItem.mimeType || "audio/mpeg" });
    form.append("file", blob, audioItem.name || "audio.mp3");
    form.append("model", modelId);
    if (body.taskDirective?.trim()) {
      form.append("prompt", body.taskDirective);
    }

    const resp = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
      signal,
    });
    if (!resp.ok) {
      throw new Error(`OpenAI Transcription API ${resp.status}: ${await resp.text()}`);
    }
    const json = (await resp.json()) as { text?: string };
    emit({ type: "delta", text: json.text ?? JSON.stringify(json, null, 2) });
    return;
  }

  // 4. Video generation (sora*)
  if (lower.includes("sora")) {
    emit({ type: "status", message: `Submitting video request to ${modelId}...` });
    const resp = await fetch(`${baseUrl}/videos`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        prompt: textPrompt,
      }),
      signal,
    });
    if (!resp.ok) {
      throw new Error(`OpenAI Video API ${resp.status}: ${await resp.text()}`);
    }
    const json = (await resp.json()) as { url?: string; data?: Array<{ url?: string; b64_json?: string }> };
    const vidUrl = json.url ?? json.data?.[0]?.url;
    const vidB64 = json.data?.[0]?.b64_json;
    if (vidUrl || vidB64) {
      emit({
        type: "media",
        asset: {
          id: `oai-vid-${Date.now()}`,
          kind: "video",
          mimeType: "video/mp4",
          dataUrl: vidB64 ? `data:video/mp4;base64,${vidB64}` : (vidUrl as string),
          filename: `sora_output.mp4`,
        },
      });
    }
    emit({ type: "delta", text: JSON.stringify(json, null, 2) });
    return;
  }

  // 5. Standard Chat Completions / Vision / Multimodal
  emit({ type: "status", message: `Streaming from ${modelId}...` });
  const userContent: Array<Record<string, unknown>> = [{ type: "text", text: textPrompt }];

  for (const item of potItems) {
    if (item.kind === "image" && item.base64Data) {
      userContent.push({
        type: "image_url",
        image_url: {
          url: `data:${item.mimeType || "image/png"};base64,${item.base64Data}`,
        },
      });
    } else if (item.kind === "audio" && item.base64Data && lower.includes("audio")) {
      const fmt = item.mimeType.includes("wav") ? "wav" : "mp3";
      userContent.push({
        type: "input_audio",
        input_audio: {
          data: item.base64Data,
          format: fmt,
        },
      });
    }
  }

  const messages: Array<Record<string, unknown>> = [];
  if (body.systemPrompt?.trim()) {
    messages.push({ role: "system", content: body.systemPrompt });
  }
  messages.push({ role: "user", content: userContent });

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      messages,
      stream: true,
    }),
    signal,
  });

  if (!resp.ok) {
    throw new Error(`OpenAI API ${resp.status}: ${await resp.text()}`);
  }

  if (resp.body) {
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const dataStr = trimmed.slice(5).trim();
        if (dataStr === "[DONE]") continue;
        try {
          const parsed = JSON.parse(dataStr) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) emit({ type: "delta", text: content });
        } catch {
          // ignore partial chunks
        }
      }
    }
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "80mb" }));

  app.post("/api/orchestrate/stream", async (req, res) => {
    const emit = createSseEmitter(res);
    const abortController = new AbortController();

    req.on("close", () => {
      abortController.abort();
    });

    try {
      const body = req.body as OrchestrateRequestBody;
      if (body.provider === "gemini") {
        await handleGemini(body, emit, abortController.signal);
      } else if (body.provider === "cloudflare") {
        await handleCloudflare(body, emit, abortController.signal);
      } else if (body.provider === "openai") {
        await handleOpenAI(body, emit, abortController.signal);
      } else {
        throw new Error(`Unsupported provider: ${String(body.provider)}`);
      }
      emit({ type: "done" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      emit({ type: "error", message });
    } finally {
      if (!res.writableEnded) {
        res.end();
      }
    }
  });

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      hasServerGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, "dist");
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, "0.0.0.0", () => {
    console.log(`PolyTable server running on http://0.0.0.0:${port}`);
  });
}

startServer();
