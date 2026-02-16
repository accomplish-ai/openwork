// src/main/adapters/HuggingFaceAdapter.ts

import { pipeline, Pipeline, env } from "@xenova/transformers";
import { EventEmitter } from "events";
import path from "path";
import fs from "fs/promises";
import { app } from "electron";
import type {
  HuggingFaceConfig,
  ModelDownloadProgress,
} from "../../../../../packages/agent-core/src/common/types/provider";

export class HuggingFaceAdapter extends EventEmitter {
  private pipeline: any = null;
  private config: HuggingFaceConfig;
  private cacheDir: string;
  private isLoading: boolean = false;

  constructor(config: HuggingFaceConfig) {
    super();
    this.config = config;
    this.cacheDir =
      config.cacheDir || path.join(app.getPath("userData"), "hf-models");

    // Configure Transformers.js cache
    env.cacheDir = this.cacheDir;
    env.allowLocalModels = true;
    env.allowRemoteModels = true;
  }

  async initialize(): Promise<void> {
    if (this.pipeline) return;
    if (this.isLoading) {
      throw new Error("Model is already being loaded");
    }

    this.isLoading = true;

    try {
      // Ensure cache directory exists
      await fs.mkdir(this.cacheDir, { recursive: true });

      // Emit progress events during model loading
      this.emit("progress", {
        modelId: this.config.modelId,
        status: "loading",
        progress: 0,
        downloadedBytes: 0,
        totalBytes: 0,
      } as ModelDownloadProgress);

      // Load the model pipeline
      this.pipeline = await pipeline("text-generation", this.config.modelId, {
        quantized: this.config.quantization !== "fp32",
        progress_callback: (progress: any) => {
          console.log("[HuggingFace Adapter] Progress:", progress);

          if (progress.status === "progress" && progress.total > 0) {
            const percentage = Math.round(
              (progress.loaded / progress.total) * 100,
            );
            this.emit("progress", {
              modelId: this.config.modelId,
              status: "downloading",
              progress: percentage,
              downloadedBytes: progress.loaded,
              totalBytes: progress.total,
            } as ModelDownloadProgress);
          } else if (
            progress.status === "done" ||
            progress.status === "ready"
          ) {
            // Model is ready!
            this.emit("progress", {
              modelId: this.config.modelId,
              status: "ready",
              progress: 100,
              downloadedBytes: progress.total || 0,
              totalBytes: progress.total || 0,
            } as ModelDownloadProgress);
          }
        },
      });

      this.emit("progress", {
        modelId: this.config.modelId,
        status: "ready",
        progress: 100,
        downloadedBytes: 0,
        totalBytes: 0,
      } as ModelDownloadProgress);
    } catch (error) {
      this.emit("progress", {
        modelId: this.config.modelId,
        status: "error",
        progress: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      } as ModelDownloadProgress);
      throw error;
    } finally {
      this.isLoading = false;
    }
  }

  async *generateStream(
    messages: Array<{ role: string; content: string }>,
    options?: {
      temperature?: number;
      maxTokens?: number;
      topP?: number;
    },
  ): AsyncGenerator<string, void, unknown> {
    if (!this.pipeline) {
      await this.initialize();
    }

    if (!this.pipeline) {
      throw new Error("Pipeline not initialized");
    }

    // Convert messages to prompt format
    const prompt = this.formatMessages(messages);

    // Generate tokens with streaming
    const result = await this.pipeline(prompt, {
      max_new_tokens: options?.maxTokens || this.config.maxTokens || 512,
      temperature: options?.temperature || this.config.temperature || 0.7,
      top_p: options?.topP || this.config.topP || 0.9,
      do_sample: true,
      return_full_text: false,
    });

    // Transformers.js doesn't natively support token-by-token streaming
    // We'll simulate it by yielding chunks of the generated text
    const text = result[0].generated_text;
    const chunkSize = 3; // characters per chunk

    for (let i = 0; i < text.length; i += chunkSize) {
      const chunk = text.slice(i, i + chunkSize);
      yield chunk;
      // Small delay to simulate streaming
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  async generate(
    messages: Array<{ role: string; content: string }>,
    options?: {
      temperature?: number;
      maxTokens?: number;
      topP?: number;
    },
  ): Promise<string> {
    let fullText = "";
    for await (const chunk of this.generateStream(messages, options)) {
      fullText += chunk;
    }
    return fullText;
  }

  private formatMessages(
    messages: Array<{ role: string; content: string }>,
  ): string {
    // Format messages according to common chat template
    // This might need to be adjusted per model
    let prompt = "";

    for (const message of messages) {
      if (message.role === "system") {
        prompt += `<|system|>\n${message.content}\n`;
      } else if (message.role === "user") {
        prompt += `<|user|>\n${message.content}\n`;
      } else if (message.role === "assistant") {
        prompt += `<|assistant|>\n${message.content}\n`;
      }
    }

    prompt += "<|assistant|>\n";
    return prompt;
  }

  async dispose(): Promise<void> {
    if (this.pipeline) {
      // Transformers.js doesn't have explicit cleanup
      // but we can clear the reference
      this.pipeline = null;
    }
  }

  getModelInfo(): { modelId: string; quantization: string; device: string } {
    return {
      modelId: this.config.modelId,
      quantization: this.config.quantization,
      device: this.config.device,
    };
  }

  async getCacheSize(): Promise<number> {
    try {
      const modelPath = path.join(this.cacheDir, this.config.modelId);
      const stats = await fs.stat(modelPath);
      return stats.size;
    } catch {
      return 0;
    }
  }

  async clearCache(): Promise<void> {
    const modelPath = path.join(this.cacheDir, this.config.modelId);
    await fs.rm(modelPath, { recursive: true, force: true });
    await this.dispose();
  }
}
