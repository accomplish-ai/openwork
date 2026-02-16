// src/renderer/components/settings/HuggingFaceSettings.tsx

import React, { useState, useEffect } from 'react';
import type { HuggingFaceModel, HuggingFaceConfig, ModelDownloadProgress } from '../../../../../../packages/agent-core/src/common/types/provider';

interface CacheStats {
  totalSize: number;
  modelCount: number;
  cacheDir: string;
  modelSizes: Array<{ modelId: string; size: number }>;
}

export const HuggingFaceSettings: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<HuggingFaceModel[]>([]);
  const [installedModels, setInstalledModels] = useState<HuggingFaceModel[]>([]);
  const [recommendedModels, setRecommendedModels] = useState<Array<{ id: string; name: string; description: string }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<Map<string, ModelDownloadProgress>>(new Map());
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [activeTab, setActiveTab] = useState<'recommended' | 'search' | 'installed'>('recommended');

  useEffect(() => {
    loadInitialData();
    setupProgressListener();
  }, []);

  const loadInitialData = async () => {
    try {
      const [installed, recommended, stats] = await Promise.all([
        (window.Electron as any).invoke('hf:get-installed-models'),
        (window.Electron as any).invoke('hf:get-recommended-models'),
        (window.Electron as any).invoke('hf:get-cache-stats'),
      ]);
      
      setInstalledModels(installed);
      setRecommendedModels(recommended);
      setCacheStats(stats);
    } catch (error) {
      console.error('Failed to load initial data:', error);
    }
  };

  const setupProgressListener = () => {
    (window.Electron as any).on('hf:download-progress', (_event: any, progress: ModelDownloadProgress) => {
      setDownloadProgress(prev => new Map(prev).set(progress.modelId, progress));
      
      // Refresh installed models when download completes
      if (progress.status === 'ready') {
        loadInitialData();
      }
    });
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      const results = await (window.Electron as any).invoke('hf:search-models', searchQuery, 20);
      setSearchResults(results);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleLoadModel = async (modelId: string, quantization: string = 'q4') => {
    const config: HuggingFaceConfig = {
      modelId,
      quantization: quantization as 'q4' | 'q8' | 'fp16' | 'fp32',
      device: 'auto',
      maxTokens: 512,
      temperature: 0.7,
      topP: 0.9,
    };

    try {
      const result = await (window.Electron as any).invoke('hf:load-model', config);
      if (result.success) {
        console.log('Model loaded:', modelId);
      } else {
        console.error('Failed to load model:', result.message);
      }
    } catch (error) {
      console.error('Error loading model:', error);
    }
  };

  const handleRemoveModel = async (modelId: string) => {
    if (!confirm(`Are you sure you want to remove ${modelId}?`)) {
      return;
    }

    try {
      await (window.Electron as any).invoke('hf:remove-model', modelId);
      await loadInitialData();
    } catch (error) {
      console.error('Error removing model:', error);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const renderProgressBar = (progress: ModelDownloadProgress) => {
    return (
      <div className="mt-2">
        <div className="flex justify-between text-xs text-gray-600 mb-1">
          <span>{progress.status}</span>
          <span>{progress.progress}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress.progress}%` }}
          />
        </div>
        {progress.totalBytes > 0 && (
          <div className="text-xs text-gray-500 mt-1">
            {formatBytes(progress.downloadedBytes)} / {formatBytes(progress.totalBytes)}
          </div>
        )}
      </div>
    );
  };

  const renderModelCard = (model: { id: string; name: string; description: string }, showActions: boolean = true) => {
    const progress = downloadProgress.get(model.id);
    const isInstalled = installedModels.some(m => m.id === model.id);

    return (
      <div key={model.id} className="border rounded-lg p-4 bg-white shadow-sm">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <h4 className="font-semibold text-gray-900">{model.name}</h4>
            <p className="text-sm text-gray-600 mt-1">{model.description}</p>
            <p className="text-xs text-gray-500 mt-1 font-mono">{model.id}</p>
          </div>
          {showActions && (
            <div className="ml-4">
              {isInstalled ? (
                <button
                  onClick={() => handleRemoveModel(model.id)}
                  className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Remove
                </button>
              ) : progress ? (
                <span className="px-3 py-1 text-sm bg-gray-100 text-gray-600 rounded">
                  {progress.status}...
                </span>
              ) : (
                <button
                  onClick={() => handleLoadModel(model.id)}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Install
                </button>
              )}
            </div>
          )}
        </div>
        {progress && renderProgressBar(progress)}
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-6">HuggingFace Local Models</h2>

      {/* Cache Statistics */}
      {cacheStats && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-blue-900 mb-2">Cache Statistics</h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-blue-700">Total Size:</span>
              <span className="ml-2 font-semibold">{formatBytes(cacheStats.totalSize)}</span>
            </div>
            <div>
              <span className="text-blue-700">Installed Models:</span>
              <span className="ml-2 font-semibold">{cacheStats.modelCount}</span>
            </div>
            <div>
              <span className="text-blue-700">Cache Directory:</span>
              <span className="ml-2 font-mono text-xs">{cacheStats.cacheDir}</span>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex space-x-4 border-b mb-6">
        <button
          onClick={() => setActiveTab('recommended')}
          className={`pb-2 px-4 font-medium ${
            activeTab === 'recommended'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Recommended
        </button>
        <button
          onClick={() => setActiveTab('search')}
          className={`pb-2 px-4 font-medium ${
            activeTab === 'search'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Search Models
        </button>
        <button
          onClick={() => setActiveTab('installed')}
          className={`pb-2 px-4 font-medium ${
            activeTab === 'installed'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Installed ({installedModels.length})
        </button>
      </div>

      {/* Recommended Models Tab */}
      {activeTab === 'recommended' && (
        <div>
          <p className="text-gray-600 mb-4">
            These models are optimized for local inference and provide a good balance of performance and resource usage.
          </p>
          <div className="space-y-4">
            {recommendedModels.map(model => renderModelCard(model))}
          </div>
        </div>
      )}

      {/* Search Tab */}
      {activeTab === 'search' && (
        <div>
          <div className="flex space-x-2 mb-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search HuggingFace models..."
              className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSearch}
              disabled={isSearching}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
            >
              {isSearching ? 'Searching...' : 'Search'}
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-4">
              {searchResults.map(model => renderModelCard(model))}
            </div>
          )}

          {searchResults.length === 0 && !isSearching && (
            <div className="text-center text-gray-500 py-8">
              Search for models on HuggingFace Hub
            </div>
          )}
        </div>
      )}

      {/* Installed Tab */}
      {activeTab === 'installed' && (
        <div>
          {installedModels.length > 0 ? (
            <div className="space-y-4">
              {installedModels.map(model => renderModelCard(model))}
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">
              No models installed yet. Install models from the Recommended or Search tabs.
            </div>
          )}
        </div>
      )}

      {/* Info Box */}
      <div className="mt-8 bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h3 className="font-semibold text-gray-900 mb-2">About Local Models</h3>
        <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
          <li>Models run entirely on your device - no API calls required</li>
          <li>First-time setup downloads model files (500MB - 4GB)</li>
          <li>Smaller models (1B-3B) work well on most hardware</li>
          <li>GPU acceleration available on supported devices</li>
          <li>Models are cached for offline use</li>
        </ul>
      </div>
    </div>
  );
};