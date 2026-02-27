import type { ToolFailure, DesktopControlResult } from './desktop-control';

export type DesktopActionName =
  | 'move_mouse'
  | 'click'
  | 'double_click'
  | 'scroll'
  | 'type_text'
  | 'press_key'
  | 'activate_app';

export type DesktopActionModifierKey = 'command' | 'shift' | 'option' | 'control';

export type DesktopActionRequest =
  | { action: 'move_mouse'; x: number; y: number }
  | { action: 'click'; x: number; y: number; button?: 'left' | 'right' }
  | { action: 'double_click'; x: number; y: number }
  | { action: 'scroll'; direction: 'up' | 'down' | 'left' | 'right'; amount?: number }
  | { action: 'type_text'; text: string }
  | { action: 'press_key'; key: string; modifiers?: DesktopActionModifierKey[] }
  | { action: 'activate_app'; appName: string };

export interface DesktopActionOutcome {
  action: DesktopActionName;
  message: string;
}

export type DesktopActionResult = DesktopControlResult<DesktopActionOutcome>;

export type DesktopActionFailure = ToolFailure;
