export type SandboxMode = 'none' | 'docker';

export interface SandboxNetworkPolicy {
  allowOutbound: boolean;
  allowedHosts?: string[];
}

export interface SandboxConfig {
  mode: SandboxMode;
  dockerImage?: string;
  allowedPaths?: string[];
  networkPolicy: SandboxNetworkPolicy;
}
