// Example: src/renderer/components/chat/HuggingFaceChat.tsx
// This demonstrates how to use the HuggingFace provider in your app

import React, { useState, useEffect } from 'react';

declare global {
  interface Window {
    Electron: {
      huggingface: {
        getLoadedModels: () => Promise<string[]>;
        onStreamChunk: (callback: (data: { modelId: string; chunk: string }) => void) => () => void;
        onStreamEnd: (callback: (data: { modelId: string }) => void) => () => void;
        onStreamError: (callback: (data: { modelId: string; error: string }) => void) => () => void;
        generateStream: (modelId: string, messages: Array<{ role: string; content: string }>, options: { temperature: number; maxTokens: number; topP: number }) => Promise<void>;
        loadModel: (config: { modelId: string; quantization: string; device: string; maxTokens: number; temperature: number; topP: number }) => Promise<{ success: boolean; message?: string }>;
      };
    };
  }
}

export const HuggingFaceChat: React.FC = () => {
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [loadedModels, setLoadedModels] = useState<string[]>([]);
  const [streamingText, setStreamingText] = useState('');

  useEffect(() => {
    loadAvailableModels();
    setupStreamListeners();
  }, []);

  const loadAvailableModels = async () => {
    try {
      const models = await window.Electron.huggingface.getLoadedModels();
      setLoadedModels(models);
      if (models.length > 0 && !selectedModel) {
        setSelectedModel(models[0]);
      }
    } catch (error) {
      console.error('Failed to load models:', error);
    }
  };

  const setupStreamListeners = () => {
    // Listen for streaming chunks
    const cleanupChunk = window.Electron.huggingface.onStreamChunk((data) => {
      if (data.modelId === selectedModel) {
        setStreamingText(prev => prev + data.chunk);
      }
    });

    // Listen for stream end
    const cleanupEnd = window.Electron.huggingface.onStreamEnd((data) => {
      if (data.modelId === selectedModel) {
        setMessages(prev => [...prev, { role: 'assistant', content: streamingText }]);
        setStreamingText('');
        setIsLoading(false);
      }
    });

    // Listen for stream errors
    const cleanupError = window.Electron.huggingface.onStreamError((data) => {
      if (data.modelId === selectedModel) {
        console.error('Stream error:', data.error);
        setIsLoading(false);
        setStreamingText('');
      }
    });

    // Cleanup listeners on unmount
    return () => {
      cleanupChunk();
      cleanupEnd();
      cleanupError();
    };
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !selectedModel || isLoading) return;

    const userMessage = { role: 'user', content: input };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);
    setStreamingText('');

    try {
      // Use streaming generation
      await window.Electron.huggingface.generateStream(
        selectedModel,
        updatedMessages,
        {
          temperature: 0.7,
          maxTokens: 512,
          topP: 0.9,
        }
      );
    } catch (error) {
      console.error('Generation failed:', error);
      setIsLoading(false);
    }
  };

  const handleLoadNewModel = async () => {
    try {
      // Example: Load Llama 3.2 1B
      const result = await window.Electron.huggingface.loadModel({
        modelId: 'Xenova/llama-3.2-1B-Instruct',
        quantization: 'q4',
        device: 'auto',
        maxTokens: 512,
        temperature: 0.7,
        topP: 0.9,
      });

      if (result.success) {
        await loadAvailableModels();
      } else {
        console.error('Failed to load model:', result.message);
      }
    } catch (error) {
      console.error('Error loading model:', error);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header with model selector */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium">Model:</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="px-3 py-1 border rounded"
              disabled={isLoading}
            >
              {loadedModels.length === 0 && (
                <option value="">No models loaded</option>
              )}
              {loadedModels.map(modelId => (
                <option key={modelId} value={modelId}>
                  {modelId}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleLoadNewModel}
            className="px-4 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            disabled={isLoading}
          >
            Load Model
          </button>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[70%] rounded-lg p-3 ${
                message.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-900'
              }`}
            >
              {message.content}
            </div>
          </div>
        ))}

        {/* Streaming message */}
        {streamingText && (
          <div className="flex justify-start">
            <div className="max-w-[70%] rounded-lg p-3 bg-gray-200 text-gray-900">
              {streamingText}
              <span className="inline-block w-2 h-4 ml-1 bg-gray-900 animate-pulse" />
            </div>
          </div>
        )}

        {/* Loading indicator */}
        {isLoading && !streamingText && (
          <div className="flex justify-start">
            <div className="bg-gray-200 rounded-lg p-3">
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-gray-600 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-gray-600 rounded-full animate-bounce delay-100" />
                <div className="w-2 h-2 bg-gray-600 rounded-full animate-bounce delay-200" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="p-4 border-t">
        <div className="flex space-x-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder={selectedModel ? 'Type your message...' : 'Please load a model first'}
            className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={!selectedModel || isLoading}
          />
          <button
            onClick={handleSendMessage}
            disabled={!selectedModel || isLoading || !input.trim()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};