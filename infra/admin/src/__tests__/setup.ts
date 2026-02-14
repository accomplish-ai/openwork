import { vi } from "vitest";

export interface MockKVEntry {
  value: string;
  metadata?: unknown;
}

export function createMockKV(store: Map<string, MockKVEntry> = new Map()): KVNamespace {
  return {
    get: vi.fn(async (key: string, options?: { type?: string }) => {
      const entry = store.get(key);
      if (!entry) return null;
      if (options?.type === "json") return JSON.parse(entry.value);
      return entry.value;
    }),
    put: vi.fn(async (key: string, value: string, options?: { metadata?: unknown }) => {
      store.set(key, { value, metadata: options?.metadata });
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    list: vi.fn(async (options?: { prefix?: string; limit?: number; cursor?: string }) => {
      const prefix = options?.prefix ?? "";
      const limit = options?.limit ?? 1000;
      const keys = [...store.keys()]
        .filter((k) => k.startsWith(prefix))
        .sort()
        .slice(0, limit)
        .map((name) => ({ name, expiration: undefined, metadata: store.get(name)?.metadata }));
      return { keys, list_complete: keys.length < limit, cursor: "" };
    }),
    getWithMetadata: vi.fn(),
  } as unknown as KVNamespace;
}

export function createMockR2(objects: Map<string, unknown> = new Map()): R2Bucket {
  return {
    get: vi.fn(async (key: string) => {
      const data = objects.get(key);
      if (!data) return null;
      return {
        json: async () => data,
        text: async () => JSON.stringify(data),
        body: null,
        bodyUsed: false,
        arrayBuffer: async () => new ArrayBuffer(0),
        blob: async () => new Blob(),
      };
    }),
    list: vi.fn(async (options?: { prefix?: string; delimiter?: string }) => {
      const prefix = options?.prefix ?? "";
      const delimiter = options?.delimiter;
      const allKeys = [...objects.keys()].filter((k) => k.startsWith(prefix));

      if (delimiter) {
        const prefixes = new Set<string>();
        for (const key of allKeys) {
          const rest = key.slice(prefix.length);
          const idx = rest.indexOf(delimiter);
          if (idx !== -1) {
            prefixes.add(prefix + rest.slice(0, idx + 1));
          }
        }
        return {
          objects: [],
          delimitedPrefixes: [...prefixes],
          truncated: false,
        };
      }

      return {
        objects: allKeys.map((key) => ({ key, size: 0 })),
        delimitedPrefixes: [],
        truncated: false,
      };
    }),
    put: vi.fn(),
    delete: vi.fn(),
    head: vi.fn(),
    createMultipartUpload: vi.fn(),
    resumeMultipartUpload: vi.fn(),
  } as unknown as R2Bucket;
}

export function createMockEnv(overrides?: {
  kvStore?: Map<string, MockKVEntry>;
  r2Objects?: Map<string, unknown>;
}) {
  return {
    ROUTING_CONFIG: createMockKV(overrides?.kvStore),
    ASSETS: createMockR2(overrides?.r2Objects),
    DOWNLOADS_BUCKET: createMockR2(overrides?.r2Objects),
    GITHUB_TOKEN: "test-github-token",
    GITHUB_REPO: "test-org/test-repo",
    AUDIT_WEBHOOK_SECRET: "test-webhook-secret",
  };
}

export function createMockExecutionContext(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;
}
