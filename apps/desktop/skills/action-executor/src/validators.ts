import {
  type MouseButton,
  type ScrollDirection,
  type ModifierKey,
  MIN_COORDINATE,
  MAX_COORDINATE,
  MAX_APP_NAME_LENGTH,
  DEFAULT_SCROLL_AMOUNT,
  MIN_SCROLL_AMOUNT,
  MAX_SCROLL_AMOUNT,
  VALID_BUTTONS,
  VALID_DIRECTIONS,
  VALID_MODIFIERS,
  KEY_CODES,
} from './constants';
import { invalidInput } from './errors';

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalidInput('Tool arguments must be an object', { receivedType: typeof value });
  }
  return value as Record<string, unknown>;
}

export function parseFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    invalidInput(`${field} must be a finite number`, { field, received: value });
  }
  return value;
}

export function parseCoordinate(value: unknown, field: 'x' | 'y'): number {
  const numericValue = parseFiniteNumber(value, field);
  return clampNumber(Math.round(numericValue), MIN_COORDINATE, MAX_COORDINATE);
}

export function parseButton(value: unknown): MouseButton {
  if (value === undefined) {
    return 'left';
  }

  if (typeof value !== 'string' || !VALID_BUTTONS.has(value as MouseButton)) {
    invalidInput('button must be one of: left, right', { field: 'button', received: value });
  }

  return value as MouseButton;
}

export function parseDirection(value: unknown): ScrollDirection {
  if (typeof value !== 'string' || !VALID_DIRECTIONS.has(value as ScrollDirection)) {
    invalidInput('direction must be one of: up, down, left, right', { field: 'direction', received: value });
  }

  return value as ScrollDirection;
}

export function parseScrollAmount(value: unknown): number {
  if (value === undefined) {
    return DEFAULT_SCROLL_AMOUNT;
  }

  const numericValue = parseFiniteNumber(value, 'amount');
  if (numericValue < 0) {
    invalidInput('amount must be greater than or equal to 0', { field: 'amount', received: value });
  }

  return clampNumber(Math.round(numericValue), MIN_SCROLL_AMOUNT, MAX_SCROLL_AMOUNT);
}

export function parseText(value: unknown): string {
  if (typeof value !== 'string') {
    invalidInput('text must be a string', { field: 'text', receivedType: typeof value });
  }

  return value;
}

export function parseAppName(value: unknown): string {
  if (typeof value !== 'string') {
    invalidInput('app_name must be a string', { field: 'app_name', receivedType: typeof value });
  }

  const appName = value.trim();
  if (appName.length === 0) {
    invalidInput('app_name cannot be empty', { field: 'app_name' });
  }

  if (appName.length > MAX_APP_NAME_LENGTH) {
    invalidInput(`app_name must be ${MAX_APP_NAME_LENGTH} characters or fewer`, {
      field: 'app_name',
      length: appName.length,
    });
  }

  return appName;
}

export function parseKey(value: unknown): string {
  if (typeof value !== 'string') {
    invalidInput('key must be a string', { field: 'key', receivedType: typeof value });
  }

  const key = value.trim();
  if (key.length === 0) {
    invalidInput('key cannot be empty', { field: 'key' });
  }

  if (key.length === 1) {
    if (!/^[\x20-\x7E]$/.test(key)) {
      invalidInput('key must be a printable ASCII character or a supported key name', {
        field: 'key',
        received: value,
      });
    }
    return key;
  }

  const normalizedKey = key.toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(KEY_CODES, normalizedKey)) {
    invalidInput(`Unsupported key: ${key}`, { field: 'key', received: value });
  }

  return normalizedKey;
}

export function parseModifiers(value: unknown): ModifierKey[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    invalidInput('modifiers must be an array of strings', {
      field: 'modifiers',
      receivedType: typeof value,
    });
  }

  const parsed: ModifierKey[] = [];
  const seen = new Set<ModifierKey>();

  for (const modifierValue of value) {
    if (typeof modifierValue !== 'string') {
      invalidInput('modifiers must be an array of strings', {
        field: 'modifiers',
        received: modifierValue,
      });
    }

    const normalizedModifier = modifierValue.toLowerCase() as ModifierKey;
    if (!VALID_MODIFIERS.has(normalizedModifier)) {
      invalidInput('modifiers must be one or more of: command, shift, option, control', {
        field: 'modifiers',
        received: modifierValue,
      });
    }

    if (seen.has(normalizedModifier)) {
      invalidInput(`Duplicate modifier is not allowed: ${normalizedModifier}`, {
        field: 'modifiers',
        received: value,
      });
    }

    seen.add(normalizedModifier);
    parsed.push(normalizedModifier);
  }

  return parsed;
}
