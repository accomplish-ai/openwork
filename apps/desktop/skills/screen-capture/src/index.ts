#!/usr/bin/env node
/**
 * Screen Capture MCP Server
 *
 * Provides tools for capturing screenshots and background window context on macOS.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';

import {
  BACKGROUND_SAMPLE_INTERVAL_MS,
  MAX_CAPTURED_WINDOWS_PER_REFRESH,
  TARGET_IMAGE_LIMITS,
} from './constants';
import { buildWindowContext, getBackgroundSnapshot, startBackgroundSampler } from './background-context';
import { desktopContextHelper } from './desktop-context-helper';
import { formatToolError, normalizeHelperFailure, ToolError } from './errors';
import {
  parseBoolean,
  parseOptionalAppName,
  parseOptionalWindowId,
  parseWindowIds,
  toInt,
} from './parsing';
import { captureScreen, getScreenInfo } from './screen-capture';
import { collectTextInputCandidates, resolveWindowForTextInputs } from './text-inputs';
import type {
  BackgroundContextArgs,
  FindTextInputsArgs,
  ListWindowsArgs,
  WindowContextRecord,
} from './types';
import { buildSelectionContext, isBackgroundWindow } from './window-selection';
import { buildWindowMetadataOnly, buildWindowSummary, filterWindows, getWindowById } from './window-utils';

// Create MCP server
const server = new Server(
  { name: 'screen-capture', version: '1.1.0' },
  { capabilities: { tools: {} } }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'capture_screen',
      description:
        'Capture a screenshot of the entire screen or active window. Returns a base64-encoded PNG image.',
      inputSchema: {
        type: 'object',
        properties: {
          include_cursor: {
            type: 'boolean',
            description: 'Whether to include the mouse cursor in the screenshot',
            default: true,
          },
          active_window_only: {
            type: 'boolean',
            description: 'If true, capture only the active/frontmost window instead of the entire screen',
            default: false,
          },
        },
        required: [],
      },
    },
    {
      name: 'get_screen_info',
      description:
        'Get information about the current screen state: active application, window title, screen size, and mouse position.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    {
      name: 'list_windows',
      description:
        'List windows across applications, including background windows, with metadata and capture state.',
      inputSchema: {
        type: 'object',
        properties: {
          include_minimized: {
            type: 'boolean',
            description: 'Include minimized windows in the response.',
            default: true,
          },
          include_offscreen: {
            type: 'boolean',
            description: 'Include windows that are offscreen or currently not visible.',
            default: true,
          },
        },
        required: [],
      },
    },
    {
      name: 'capture_window',
      description:
        'Capture a specific window by CGWindowID and return image + metadata if available.',
      inputSchema: {
        type: 'object',
        properties: {
          window_id: {
            type: 'number',
            description: 'Window identifier returned by list_windows.',
          },
        },
        required: ['window_id'],
      },
    },
    {
      name: 'inspect_window',
      description:
        'Inspect a window accessibility tree by window ID. Requires Accessibility permission.',
      inputSchema: {
        type: 'object',
        properties: {
          window_id: {
            type: 'number',
            description: 'Window identifier returned by list_windows.',
          },
          max_depth: {
            type: 'number',
            description: 'Maximum accessibility traversal depth.',
            default: 10,
          },
          max_nodes: {
            type: 'number',
            description: 'Maximum accessibility node count.',
            default: 1000,
          },
        },
        required: ['window_id'],
      },
    },
    {
      name: 'find_text_inputs',
      description:
        'Find editable text inputs in a target window and return click-safe center points ranked for chat-composer targeting.',
      inputSchema: {
        type: 'object',
        properties: {
          window_id: {
            type: 'number',
            description: 'Optional specific window ID returned by list_windows.',
          },
          app_name: {
            type: 'string',
            description: 'Optional app-name match (for example "Codex") when window_id is not provided.',
          },
          max_depth: {
            type: 'number',
            description: 'Maximum accessibility traversal depth.',
            default: 12,
          },
          max_nodes: {
            type: 'number',
            description: 'Maximum accessibility node count.',
            default: 2000,
          },
        },
        required: [],
      },
    },
    {
      name: 'get_background_context',
      description:
        'Return cached background window context (metadata + optional images + optional accessibility trees).',
      inputSchema: {
        type: 'object',
        properties: {
          include_images: {
            type: 'boolean',
            description: 'Include captured window images in result content.',
            default: true,
          },
          include_ax: {
            type: 'boolean',
            description: 'Include accessibility trees for selected windows.',
            default: false,
          },
          window_ids: {
            type: 'array',
            description: 'Optional subset of window IDs to include.',
            items: {
              type: 'number',
            },
          },
          force_refresh: {
            type: 'boolean',
            description: 'Force immediate recapture instead of using cache.',
            default: false,
          },
        },
        required: [],
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(
  CallToolRequestSchema,
  async (request): Promise<CallToolResult> => {
    const { name, arguments: args } = request.params;

    try {
      if (name === 'capture_screen') {
        const includeCursor =
          (args as { include_cursor?: boolean })?.include_cursor ?? true;
        const activeWindowOnly =
          (args as { active_window_only?: boolean })?.active_window_only ??
          false;

        const screenshot = await captureScreen({
          includeCursor,
          activeWindowOnly,
        });

        return {
          content: [
            {
              type: 'image',
              data: screenshot.imageDataUrl.replace('data:image/png;base64,', ''),
              mimeType: 'image/png',
            },
            {
              type: 'text',
              text: JSON.stringify(
                {
                  status: 'ok',
                  message: `Screenshot captured successfully (${screenshot.mode === 'active-window' ? 'active window only' : 'full screen'})`,
                  capture_mode: screenshot.mode,
                  coordinate_space: screenshot.coordinateSpace,
                  coordinate_note:
                    'click/move_mouse use screen points. If you estimated x/y from screenshot pixels, divide by pixelsPerPoint before clicking.',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      if (name === 'get_screen_info') {
        const info = await getScreenInfo();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(info, null, 2),
            },
          ],
        };
      }

      if (name === 'list_windows') {
        const parsedArgs = (args ?? {}) as ListWindowsArgs;
        const includeMinimized = parseBoolean(parsedArgs.include_minimized, true);
        const includeOffscreen = parseBoolean(parsedArgs.include_offscreen, true);

        const windows = await desktopContextHelper.listWindows();
        const filtered = filterWindows(windows, {
          includeMinimized,
          includeOffscreen,
        });
        const selectionContext = buildSelectionContext(filtered);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  timestamp: new Date().toISOString(),
                  count: filtered.length,
                  foregroundAppName: selectionContext.foregroundAppName,
                  windows: filtered.map((window) => buildWindowMetadataOnly(window, selectionContext)),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      if (name === 'capture_window') {
        const windowId = toInt((args as { window_id?: unknown })?.window_id, 'window_id');

        const windows = await desktopContextHelper.listWindows();
        const target = getWindowById(windows, windowId);

        if (!target) {
          throw new ToolError(
            'ERR_DESKTOP_CONTEXT_WINDOW_NOT_FOUND',
            `Window ${windowId} was not found. Run list_windows and retry.`
          );
        }

        const context = await buildWindowContext(target, {
          imageLimits: TARGET_IMAGE_LIMITS,
        });
        const selectionContext = buildSelectionContext(windows);
        const content: CallToolResult['content'] = [];

        if (context.imageBase64) {
          content.push({
            type: 'image',
            data: context.imageBase64,
            mimeType: context.imageMimeType ?? 'image/png',
          });
        }

        content.push({
          type: 'text',
          text: JSON.stringify(
            {
              timestamp: new Date().toISOString(),
              foregroundAppName: selectionContext.foregroundAppName,
              window: buildWindowSummary(context, selectionContext),
              hasImage: Boolean(context.imageBase64),
            },
            null,
            2
          ),
        });

        return { content };
      }

      if (name === 'inspect_window') {
        const windowId = toInt((args as { window_id?: unknown })?.window_id, 'window_id');
        const maxDepthRaw = (args as { max_depth?: unknown })?.max_depth;
        const maxNodesRaw = (args as { max_nodes?: unknown })?.max_nodes;

        const maxDepth =
          typeof maxDepthRaw === 'number' && Number.isInteger(maxDepthRaw)
            ? Math.min(Math.max(maxDepthRaw, 1), 20)
            : 10;

        const maxNodes =
          typeof maxNodesRaw === 'number' && Number.isInteger(maxNodesRaw)
            ? Math.min(Math.max(maxNodesRaw, 1), 5000)
            : 1000;

        const tree = await desktopContextHelper.inspectWindow(windowId, maxDepth, maxNodes);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  timestamp: new Date().toISOString(),
                  windowId,
                  maxDepth,
                  maxNodes,
                  tree,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      if (name === 'find_text_inputs') {
        const parsedArgs = (args ?? {}) as FindTextInputsArgs;
        const windowId = parseOptionalWindowId(parsedArgs.window_id);
        const appName = parseOptionalAppName(parsedArgs.app_name);
        const maxDepthRaw = parsedArgs.max_depth;
        const maxNodesRaw = parsedArgs.max_nodes;

        const maxDepth =
          typeof maxDepthRaw === 'number' && Number.isInteger(maxDepthRaw)
            ? Math.min(Math.max(maxDepthRaw, 1), 20)
            : 12;

        const maxNodes =
          typeof maxNodesRaw === 'number' && Number.isInteger(maxNodesRaw)
            ? Math.min(Math.max(maxNodesRaw, 1), 5000)
            : 2000;

        const windows = await desktopContextHelper.listWindows();
        const targetWindow = resolveWindowForTextInputs(windows, { windowId, appName });
        const tree = await desktopContextHelper.inspectWindow(targetWindow.id, maxDepth, maxNodes);
        const candidates = collectTextInputCandidates(tree, targetWindow);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  timestamp: new Date().toISOString(),
                  targetWindow: buildWindowMetadataOnly(targetWindow),
                  count: candidates.length,
                  recommended:
                    candidates.length > 0
                      ? {
                          ...candidates[0],
                          index: 0,
                        }
                      : null,
                  candidates: candidates.map((candidate, index) => ({
                    ...candidate,
                    index,
                  })),
                  guidance:
                    candidates.length > 0
                      ? 'Click recommended.clickPoint, then verify focus before typing.'
                      : 'No editable text input was discovered. Retry with inspect_window or capture_screen and use a safe fallback click.',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      if (name === 'get_background_context') {
        const parsedArgs = (args ?? {}) as BackgroundContextArgs;
        const includeImages = parseBoolean(parsedArgs.include_images, true);
        const includeAx = parseBoolean(parsedArgs.include_ax, false);
        const forceRefresh = parseBoolean(parsedArgs.force_refresh, false);
        const requestedWindowIds = parseWindowIds(parsedArgs.window_ids);

        const snapshot = await getBackgroundSnapshot(forceRefresh);

        let selected = requestedWindowIds
          ? snapshot.windows.filter((window) => requestedWindowIds.includes(window.window.id))
          : snapshot.windows;

        if (includeImages && requestedWindowIds && requestedWindowIds.length > 0) {
          const refreshedSelected: WindowContextRecord[] = [];
          for (const entry of selected) {
            if (typeof entry.imageBase64 === 'string' || entry.captureState === 'minimized') {
              refreshedSelected.push(entry);
              continue;
            }

            try {
              refreshedSelected.push(
                await buildWindowContext(entry.window, {
                  imageLimits: TARGET_IMAGE_LIMITS,
                })
              );
            } catch {
              refreshedSelected.push(entry);
            }
          }
          selected = refreshedSelected;
        }

        const accessibilityTrees: Record<number, unknown> = {};
        if (includeAx) {
          for (const entry of selected) {
            try {
              accessibilityTrees[entry.window.id] = await desktopContextHelper.inspectWindow(
                entry.window.id,
                10,
                1000
              );
            } catch (error) {
              const toolError = normalizeHelperFailure(error);
              accessibilityTrees[entry.window.id] = {
                errorCode: toolError.code,
                error: toolError.message,
              };
            }
          }
        }

        const content: CallToolResult['content'] = [];
        const selectionContext = buildSelectionContext(selected.map((entry) => entry.window));
        const backgroundEntries = selected.filter((entry) =>
          isBackgroundWindow(entry.window, selectionContext)
        );

        const imageEntries = includeImages
          ? selected.filter((entry) => typeof entry.imageBase64 === 'string')
          : [];
        const orderedImageEntries = [...imageEntries].sort((a, b) => {
          if (requestedWindowIds && requestedWindowIds.length > 0) {
            const aIndex = requestedWindowIds.indexOf(a.window.id);
            const bIndex = requestedWindowIds.indexOf(b.window.id);
            const aRank = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
            const bRank = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
            return aRank - bRank;
          }

          const aBackground = isBackgroundWindow(a.window, selectionContext) ? 1 : 0;
          const bBackground = isBackgroundWindow(b.window, selectionContext) ? 1 : 0;
          if (aBackground !== bBackground) {
            return bBackground - aBackground;
          }

          const aArea = Math.max(0, a.window.bounds.width) * Math.max(0, a.window.bounds.height);
          const bArea = Math.max(0, b.window.bounds.width) * Math.max(0, b.window.bounds.height);
          if (aArea !== bArea) {
            return bArea - aArea;
          }

          return b.window.zOrder - a.window.zOrder;
        });
        const recommendedBackgroundWindowIds = [
          ...backgroundEntries
            .filter((entry) => typeof entry.imageBase64 === 'string')
            .map((entry) => entry.window.id),
          ...backgroundEntries
            .filter((entry) => typeof entry.imageBase64 !== 'string')
            .map((entry) => entry.window.id),
        ].slice(0, MAX_CAPTURED_WINDOWS_PER_REFRESH);

        if (includeImages) {
          for (const entry of orderedImageEntries) {
            content.push({
              type: 'image',
              data: entry.imageBase64!,
              mimeType: entry.imageMimeType ?? 'image/png',
            });
          }
        }

        content.push({
          type: 'text',
          text: JSON.stringify(
            {
              timestamp: new Date().toISOString(),
              cachedAt: snapshot.capturedAt,
              fromCache: !forceRefresh,
              sampleIntervalMs: BACKGROUND_SAMPLE_INTERVAL_MS,
              foregroundAppName: selectionContext.foregroundAppName,
              windows: selected.map((entry) => ({
                ...buildWindowSummary(entry, selectionContext),
                hasImage: Boolean(includeImages && entry.imageBase64),
              })),
              images: orderedImageEntries.map((entry, index) => ({
                contentIndex: index,
                windowId: entry.window.id,
                appName: entry.window.appName,
                title: entry.window.title,
              })),
              imageCaptureBudget: MAX_CAPTURED_WINDOWS_PER_REFRESH,
              backgroundWindowCount: backgroundEntries.length,
              recommendedBackgroundWindowIds,
              windowsWithoutImages: includeImages ? selected.length - orderedImageEntries.length : undefined,
              accessibilityTrees: includeAx ? accessibilityTrees : undefined,
            },
            null,
            2
          ),
        });

        return { content };
      }

      return {
        content: [{ type: 'text', text: `ERR_UNKNOWN_TOOL|Unknown tool: ${name}` }],
        isError: true,
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: formatToolError(error) }],
        isError: true,
      };
    }
  }
);

// Start the MCP server
async function main() {
  startBackgroundSampler();

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Screen Capture MCP Server started');
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

process.on('exit', () => {
  desktopContextHelper.dispose();
});

process.on('SIGINT', () => {
  desktopContextHelper.dispose();
  process.exit(0);
});

process.on('SIGTERM', () => {
  desktopContextHelper.dispose();
  process.exit(0);
});
