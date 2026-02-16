import { useState, useEffect } from "react";
import type {
  ConnectedProvider,
  ProviderId,
} from "@accomplish_ai/agent-core/common";
import { getAccomplish } from "@/lib/accomplish";

interface HuggingFaceProviderFormProps {
  connectedProvider?: ConnectedProvider;
  onConnect: (provider: ConnectedProvider) => void;
  onDisconnect: () => void;
  onModelChange: (modelId: string) => void;
  showModelError: boolean;
}

interface InstalledModel {
  id: string;
  name: string;
  size: number;
  loaded: boolean;
}

interface RecommendedModel {
  id: string;
  name: string;
  description: string;
  size?: string;
}

export function HuggingFaceProviderForm({
  connectedProvider,
  onConnect,
  onDisconnect,
  onModelChange,
  showModelError,
}: HuggingFaceProviderFormProps) {
  const accomplish = getAccomplish();
  const [installedModels, setInstalledModels] = useState<InstalledModel[]>([]);
  const [recommendedModels, setRecommendedModels] = useState<
    RecommendedModel[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<
    Record<string, number>
  >({});
  const [activeTab, setActiveTab] = useState<"recommended" | "installed">(
    "recommended",
  );

  const isConnected = connectedProvider?.connectionStatus === "connected";

  // Load models on mount
  useEffect(() => {
    loadModels();

    // Listen for download progress
    const unsubProgress = (accomplish as any).huggingface?.onDownloadProgress?.(
      (data: any) => {
        setDownloadProgress((prev) => ({
          ...prev,
          [data.modelId]: data.progress,
        }));

        // Reload when download completes
        if (data.progress >= 100) {
          setTimeout(() => loadModels(), 500);
        }
      },
    );

    return () => {
      unsubProgress?.();
    };
  }, []);

  const loadModels = async () => {
    try {
      const [installed, recommended] = await Promise.all([
        (accomplish as any).huggingface?.getInstalledModels() || [],
        (accomplish as any).huggingface?.getRecommendedModels() || [],
      ]);

      setInstalledModels(installed);
      setRecommendedModels(recommended);
    } catch (error) {
      console.error("Failed to load models:", error);
    }
  };

  const handleConnect = async () => {
    if (installedModels.length === 0) {
      alert("Please install a model first from the Recommended tab");
      return;
    }

    // Use first installed model by default
    const firstModel = installedModels[0];

    const provider: ConnectedProvider = {
      providerId: "huggingface-local" as ProviderId,
      connectionStatus: "connected",
      selectedModelId: firstModel.id,
      credentials: { type: "api_key", keyPrefix: "local" },
      lastConnectedAt: new Date().toISOString(),
    };
    await onConnect(provider);
  };

  const handleDisconnect = async () => {
    await onDisconnect();
  };

  const handleModelSelect = async (modelId: string) => {
    await onModelChange(modelId);
  };

  const getPreferredQuantization = ():
    | "q4"
    | "q8"
    | "fp16"
    | "fp32" => {
    if (typeof window === "undefined") {
      return "q4";
    }
    const stored = window.localStorage.getItem("huggingface.quantization");
    if (stored === "q4" || stored === "q8" || stored === "fp16" || stored === "fp32") {
      return stored;
    }
    return "q4";
  };

  const handleInstallModel = async (modelId: string) => {
    setIsLoading(true);
    setDownloadProgress((prev) => ({ ...prev, [modelId]: 0 }));

    try {
      const result = await accomplish.huggingface?.loadModel({
        modelId: modelId,
        quantization: getPreferredQuantization(),
        device: "auto", // Let the adapter decide
        temperature: 0.7,
        maxTokens: 512,
        topP: 0.9,
      });

      if (result?.success) {
        await loadModels();

        // Auto-connect if this is the first model
        if (!isConnected && installedModels.length === 0) {
          setTimeout(() => handleConnect(), 1000);
        }
      } else {
        alert(`Failed to install model: ${result?.message}`);
      }
    } catch (error) {
      console.error("Error installing model:", error);
      alert("Failed to install model. Check console for details.");
      setDownloadProgress((prev) => {
        const newProgress = { ...prev };
        delete newProgress[modelId];
        return newProgress;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveModel = async (modelId: string) => {
    if (!confirm("Are you sure you want to remove this model?")) return;

    try {
      await accomplish.huggingface?.removeModel(modelId);
      await loadModels();

      // If we removed the selected model, disconnect
      if (connectedProvider?.selectedModelId === modelId) {
        await handleDisconnect();
      }
    } catch (error) {
      console.error("Error removing model:", error);
      alert("Failed to remove model.");
    }
  };

  const isInstalled = (modelId: string) => {
    return installedModels.some((m) => m.id === modelId);
  };

  const formatSize = (bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(2)} GB`;
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold">HuggingFace Local Models</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Run AI models locally without cloud APIs
          </p>
        </div>
        {isConnected ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-green-500">● Connected</span>
            <button
              onClick={handleDisconnect}
              className="px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 rounded-md"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={handleConnect}
            disabled={installedModels.length === 0}
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {installedModels.length === 0 ? "Install a Model First" : "Connect"}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-border mb-4">
        <button
          onClick={() => setActiveTab("recommended")}
          className={`pb-2 px-1 text-sm font-medium ${
            activeTab === "recommended"
              ? "text-foreground border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Recommended
        </button>
        <button
          onClick={() => setActiveTab("installed")}
          className={`pb-2 px-1 text-sm font-medium ${
            activeTab === "installed"
              ? "text-foreground border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Installed ({installedModels.length})
        </button>
      </div>

      {/* Content */}
      {activeTab === "recommended" && (
        <div className="space-y-3 max-h-[400px] overflow-y-auto">
          {recommendedModels.map((model) => {
            const installed = isInstalled(model.id);
            const progress = downloadProgress[model.id];
            const downloading = progress !== undefined && progress < 100;

            return (
              <div
                key={model.id}
                className="p-3 border border-border rounded-lg"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-sm">{model.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {model.description}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono mt-1">
                      {model.id}
                    </div>
                    {model.size && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Size: {model.size}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleInstallModel(model.id)}
                    disabled={isLoading || installed || downloading}
                    className="ml-3 px-3 py-1 text-xs font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {downloading
                      ? `${Math.round(progress)}%`
                      : installed
                      ? "Installed"
                      : "Install"}
                  </button>
                </div>

                {/* Download Progress */}
                {downloading && (
                  <div className="mt-2">
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {activeTab === "installed" && (
        <div className="space-y-3 max-h-[400px] overflow-y-auto">
          {installedModels.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No models installed. Install from the Recommended tab.
            </div>
          ) : (
            installedModels.map((model) => (
              <div
                key={model.id}
                className={`flex items-center justify-between p-3 border rounded-lg ${
                  connectedProvider?.selectedModelId === model.id
                    ? "border-primary bg-primary/5"
                    : "border-border"
                }`}
              >
                <div
                  className="flex-1 cursor-pointer"
                  onClick={() => isConnected && handleModelSelect(model.id)}
                >
                  <div className="flex items-center gap-2">
                    <div className="font-medium text-sm">
                      {model.name || model.id}
                    </div>
                    {model.loaded && (
                      <span className="text-xs bg-green-500/10 text-green-500 px-2 py-0.5 rounded-full">
                        Loaded
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono mt-1">
                    {model.id}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Size: {formatSize(model.size)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {connectedProvider?.selectedModelId === model.id && (
                    <svg
                      className="h-5 w-5 text-primary"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                  <button
                    onClick={() => handleRemoveModel(model.id)}
                    className="px-2 py-1 text-xs text-destructive hover:bg-destructive/10 rounded"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Model Selection Error */}
      {showModelError && (
        <div className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          Please select a model to complete setup
        </div>
      )}

      {/* Info */}
      <div className="mt-4 p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground">
        💡 Models run entirely on your device. First-time setup downloads model
        files (500MB-4GB).
      </div>
    </div>
  );
}
