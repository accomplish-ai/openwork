export const TOOL_DEFINITIONS = [
  {
    name: 'move_mouse',
    description: 'Move the mouse cursor to a specific screen position',
    inputSchema: {
      type: 'object' as const,
      properties: {
        x: {
          type: 'number',
          description: 'X coordinate (pixels from left edge of screen)',
        },
        y: {
          type: 'number',
          description: 'Y coordinate (pixels from top edge of screen)',
        },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'click',
    description: 'Click at a specific screen position',
    inputSchema: {
      type: 'object' as const,
      properties: {
        x: {
          type: 'number',
          description: 'X coordinate (pixels from left edge)',
        },
        y: {
          type: 'number',
          description: 'Y coordinate (pixels from top edge)',
        },
        button: {
          type: 'string',
          enum: ['left', 'right'],
          description: 'Mouse button to click (default: left)',
          default: 'left',
        },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'double_click',
    description: 'Double-click at a specific screen position',
    inputSchema: {
      type: 'object' as const,
      properties: {
        x: {
          type: 'number',
          description: 'X coordinate (pixels from left edge)',
        },
        y: {
          type: 'number',
          description: 'Y coordinate (pixels from top edge)',
        },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'activate_app',
    description: 'Bring an application to the foreground by app name',
    inputSchema: {
      type: 'object' as const,
      properties: {
        app_name: {
          type: 'string',
          description: 'Application name as shown in Launchpad/Dock (for example: "Codex", "Cursor", "Terminal")',
        },
      },
      required: ['app_name'],
    },
  },
  {
    name: 'type_text',
    description: 'Type text as if using the keyboard. Good for filling in forms or text fields.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        text: {
          type: 'string',
          description: 'The text to type',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'press_key',
    description: 'Press a specific key, optionally with modifiers. Use for keyboard shortcuts or special keys like Enter, Tab, Escape, arrow keys, etc.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        key: {
          type: 'string',
          description: 'The key to press (e.g., "return", "tab", "escape", "up", "down", "a", "1", "f1")',
        },
        modifiers: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['command', 'shift', 'option', 'control'],
          },
          description: 'Modifier keys to hold while pressing (e.g., ["command", "shift"] for Cmd+Shift)',
          default: [],
        },
      },
      required: ['key'],
    },
  },
  {
    name: 'scroll',
    description: 'Scroll the screen in a direction',
    inputSchema: {
      type: 'object' as const,
      properties: {
        direction: {
          type: 'string',
          enum: ['up', 'down', 'left', 'right'],
          description: 'Direction to scroll',
        },
        amount: {
          type: 'number',
          description: 'Number of "lines" to scroll (default: 3)',
          default: 3,
        },
      },
      required: ['direction'],
    },
  },
];
