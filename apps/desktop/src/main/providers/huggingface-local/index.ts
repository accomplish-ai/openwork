/**
 * HuggingFace Local Provider
 *
 * Entry point for the local HuggingFace inference provider.
 * Exports server lifecycle and model management functions.
 */

export {
    startServer as startHuggingFaceServer,
    stopServer as stopHuggingFaceServer,
    getServerStatus as getHuggingFaceServerStatus,
    testConnection as testHuggingFaceConnection,
} from './server';

export {
    downloadModel,
    cancelDownload,
    listCachedModels,
    deleteModel,
    getCachePath,
    SUGGESTED_MODELS,
} from './model-manager';

export type { DownloadProgress, ProgressCallback } from './model-manager';
