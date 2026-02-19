export interface BrowserFramePayload {
  data: string;
  pageUrl: string;
  timestamp: number;
}

export interface BrowserStatusPayload {
  status: 'idle' | 'starting' | 'streaming' | 'stopping' | 'error';
  error?: string;
}

export interface BrowserNavigatePayload {
  url: string;
}
