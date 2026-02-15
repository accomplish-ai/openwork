import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function getMcpToolsPath(): string {
    // TODO: In production/packaged build, this path will need to be adjusted or resolved differently.
    return path.resolve(__dirname, '../../../../packages/agent-core/mcp-tools');
}

export function getBundledSkillsPath(): string {
    // TODO: Adjust for production resources path
    return path.resolve(__dirname, '../../resources/skills');
}

export function getUserSkillsPath(): string {
    // Should be in userData/skills
    if (process.env.DAEMON_USER_DATA_PATH) {
        return path.join(process.env.DAEMON_USER_DATA_PATH, 'skills');
    }
    const home = os.homedir();
    return path.join(home, '.config', 'accomplish', 'skills');
}
