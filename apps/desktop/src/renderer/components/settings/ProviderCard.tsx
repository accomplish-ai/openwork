// apps/desktop/src/renderer/components/settings/ProviderCard.tsx

import type { ProviderId, ConnectedProvider } from '@accomplish/shared';
import { PROVIDER_META } from '@accomplish/shared';

// Import provider logos
import anthropicLogo from '/assets/ai-logos/anthropic.svg';
import openaiLogo from '/assets/ai-logos/openai.svg';
import googleLogo from '/assets/ai-logos/google.svg';
import xaiLogo from '/assets/ai-logos/xai.svg';
import deepseekLogo from '/assets/ai-logos/deepseek.svg';
import zaiLogo from '/assets/ai-logos/zai.svg';
import bedrockLogo from '/assets/ai-logos/bedrock.svg';
import ollamaLogo from '/assets/ai-logos/ollama.svg';
import openrouterLogo from '/assets/ai-logos/openrouter.svg';
import litellmLogo from '/assets/ai-logos/litellm.svg';

// Import connected badge icon
import connectedKeyIcon from '/assets/icons/connected-key.svg';

const PROVIDER_LOGOS: Record<ProviderId, string> = {
  anthropic: anthropicLogo,
  openai: openaiLogo,
  google: googleLogo,
  xai: xaiLogo,
  deepseek: deepseekLogo,
  zai: zaiLogo,
  bedrock: bedrockLogo,
  ollama: ollamaLogo,
  openrouter: openrouterLogo,
  litellm: litellmLogo,
};

interface ProviderCardProps {
  providerId: ProviderId;
  connectedProvider?: ConnectedProvider;
  isActive: boolean;
  isSelected: boolean;
  onClick: () => void;
}

export function ProviderCard({
  providerId,
  connectedProvider,
  isActive,
  isSelected,
  onClick,
}: ProviderCardProps) {
  const meta = PROVIDER_META[providerId];
  const isConnected = connectedProvider?.connectionStatus === 'connected';
  const logoSrc = PROVIDER_LOGOS[providerId];

  return (
    <button
      onClick={onClick}
      data-testid={`provider-card-${providerId}`}
      className={`relative flex flex-col items-center justify-center rounded-xl border p-4 transition-all duration-200 min-w-[120px] ${
        isSelected
          ? 'border-[#4A7C59] border-2 bg-[#D4E8D5]'
          : 'border-border bg-white hover:border-ring'
      }`}
    >
      {/* Connected badge */}
      {isConnected && (
        <div className="absolute top-2 right-2" data-testid={`provider-connected-badge-${providerId}`}>
          <img src={connectedKeyIcon} alt="Connected" className="h-5 w-5" />
        </div>
      )}

      {/* Provider Logo */}
      <div className="mb-2 h-10 w-10 flex items-center justify-center">
        <img
          src={logoSrc}
          alt={`${meta.name} logo`}
          className="h-8 w-8 object-contain"
        />
      </div>

      {/* Name */}
      <span className="text-sm font-medium text-foreground">
        {meta.name}
      </span>

      {/* Label */}
      <span className="text-xs text-muted-foreground">
        {meta.label}
      </span>
    </button>
  );
}
