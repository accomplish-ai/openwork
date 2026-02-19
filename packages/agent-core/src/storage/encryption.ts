import type { EncryptionAdapter } from '../types/storage.js';

let _adapter: EncryptionAdapter | null = null;

export function setEncryptionAdapter(adapter: EncryptionAdapter) {
  _adapter = adapter;
}

export function getEncryptionAdapter(): EncryptionAdapter | null {
  return _adapter;
}

export function isEncryptionAvailable(): boolean {
  return _adapter?.isEncryptionAvailable() ?? false;
}

export function encryptString(text: string): Buffer {
  if (!_adapter) {
    throw new Error('Encryption adapter not initialized');
  }
  return _adapter.encryptString(text);
}

export function decryptString(buffer: Buffer): string {
  if (!_adapter) {
    throw new Error('Encryption adapter not initialized');
  }
  return _adapter.decryptString(buffer);
}
