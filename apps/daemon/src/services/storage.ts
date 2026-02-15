import {
    createStorage,
    StorageAPI,
    StorageOptions,
} from '@accomplish_ai/agent-core';
import path from 'path';
import os from 'os';
import fs from 'fs';

let storageInstance: StorageAPI | null = null;

// Helper to get User Data path
export function getUserDataPath(): string {
    if (process.env.DAEMON_USER_DATA_PATH) {
        return process.env.DAEMON_USER_DATA_PATH;
    }
    const home = os.homedir();
    switch (process.platform) {
        case 'win32':
            return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Accomplish');
        case 'darwin':
            return path.join(home, 'Library', 'Application Support', 'Accomplish');
        default:
            return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'accomplish');
    }
}

export function initializeStorage(): void {
    if (storageInstance) return;

    const userDataPath = getUserDataPath();
    const storageDir = path.join(userDataPath, 'storage');
    const dbPath = path.join(storageDir, 'tasks.db');

    if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
    }

    const options: StorageOptions = {
        databasePath: dbPath,
        userDataPath: userDataPath,
    };

    storageInstance = createStorage(options);
    storageInstance.initialize();
    console.log('[Daemon] Storage initialized at:', dbPath);
}

export function getStorage(): StorageAPI {
    if (!storageInstance) {
        throw new Error('Storage not initialized. Call initializeStorage() first.');
    }
    return storageInstance;
}
