#!/usr/bin/env node
/**
 * Action Executor MCP Server
 *
 * Provides tools for executing mouse and keyboard actions on macOS
 * using AppleScript/osascript and Python's Quartz bindings.
 *
 * Requires Accessibility permissions to be granted to the parent app.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';

import { ActionExecutorError, buildErrorResult } from './errors';
import { TOOL_DEFINITIONS } from './tool-schemas';
import { asObject, parseCoordinate, parseButton, parseDirection, parseScrollAmount, parseText, parseAppName, parseKey, parseModifiers } from './validators';
import { moveMouse, click, doubleClick, typeText, pressKey, activateApp, scroll } from './actions';

// Create MCP server
const server = new Server(
  { name: 'action-executor', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOL_DEFINITIONS,
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
  const { name, arguments: args } = request.params;

  try {
    const parsedArgs = asObject(args);

    switch (name) {
      case 'move_mouse': {
        const x = parseCoordinate(parsedArgs.x, 'x');
        const y = parseCoordinate(parsedArgs.y, 'y');
        await moveMouse(x, y);
        return {
          content: [{ type: 'text', text: `Mouse moved to (${x}, ${y})` }],
        };
      }

      case 'click': {
        const x = parseCoordinate(parsedArgs.x, 'x');
        const y = parseCoordinate(parsedArgs.y, 'y');
        const button = parseButton(parsedArgs.button);
        await click(x, y, button);
        return {
          content: [{ type: 'text', text: `${button === 'right' ? 'Right-clicked' : 'Clicked'} at (${x}, ${y})` }],
        };
      }

      case 'double_click': {
        const x = parseCoordinate(parsedArgs.x, 'x');
        const y = parseCoordinate(parsedArgs.y, 'y');
        await doubleClick(x, y);
        return {
          content: [{ type: 'text', text: `Double-clicked at (${x}, ${y})` }],
        };
      }

      case 'type_text': {
        const text = parseText(parsedArgs.text);
        await typeText(text);
        return {
          content: [{ type: 'text', text: `Typed: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"` }],
        };
      }

      case 'activate_app': {
        const appName = parseAppName(parsedArgs.app_name);
        await activateApp(appName);
        return {
          content: [{ type: 'text', text: `Activated app: ${appName}` }],
        };
      }

      case 'press_key': {
        const key = parseKey(parsedArgs.key);
        const modifiers = parseModifiers(parsedArgs.modifiers);
        await pressKey(key, modifiers);
        const modStr = modifiers.length > 0 ? `${modifiers.join('+')}+` : '';
        return {
          content: [{ type: 'text', text: `Pressed: ${modStr}${key}` }],
        };
      }

      case 'scroll': {
        const direction = parseDirection(parsedArgs.direction);
        const amount = parseScrollAmount(parsedArgs.amount);
        await scroll(direction, amount);
        return {
          content: [{ type: 'text', text: `Scrolled ${direction} by ${amount} lines` }],
        };
      }

      default:
        throw new ActionExecutorError(
          'INVALID_INPUT',
          `Unknown tool: ${name}`,
          { tool: name },
          'Use one of the declared action-executor tools.'
        );
    }
  } catch (error) {
    return buildErrorResult(error);
  }
});

// Start the MCP server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Action Executor MCP Server started');
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
