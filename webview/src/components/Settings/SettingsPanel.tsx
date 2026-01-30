import { useState, useEffect } from 'react';
import { useVSCode } from '../../hooks/useVSCode';
import type { WebviewMessage } from '../../types/bridge';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  config: SettingsConfig;
  onSave: (config: SettingsConfig) => void;
}

export interface SettingsConfig {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  autoApprove?: boolean;
}

interface Model {
  id: string;
  name: string;
  isFree?: boolean;
  contextWindow?: number;
}

const PROVIDERS = [
  { 
    id: 'openrouter', 
    name: 'OpenRouter',
    description: 'Free & Paid Models (Gemini, Llama, DeepSeek)',
    requiresApiKey: true,
    hasDynamicModels: true
  },
  { 
    id: 'openai-compatible', 
    name: 'OpenAI Compatible',
    description: 'Ollama, LM Studio, OpenRouter',
    requiresApiKey: false
  },
  { 
    id: 'anthropic', 
    name: 'Anthropic Claude',
    description: 'Claude 3.5/4 Sonnet, Opus',
    requiresApiKey: true
  },
  { 
    id: 'openai', 
    name: 'OpenAI',
    description: 'GPT-4o, o1',
    requiresApiKey: true
  }
];

export function SettingsPanel({ isOpen, onClose, config, onSave }: SettingsPanelProps) {
  const { postMessage } = useVSCode();
  const [localConfig, setLocalConfig] = useState<SettingsConfig>(config);
  // Removed unused customModel state
  const [models, setModels] = useState<Model[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [onlyFree, setOnlyFree] = useState(true);

  // Update local config when prop changes
  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  // Listen for models found
  useEffect(() => {
    const handleModelsFound = (e: CustomEvent) => {
      setModels(e.detail.models);
      setIsLoadingModels(false);
    };

    window.addEventListener('modelsFound', handleModelsFound as EventListener);
    return () => window.removeEventListener('modelsFound', handleModelsFound as EventListener);
  }, []);

  if (!isOpen) return null;

  const currentProvider = PROVIDERS.find(p => p.id === localConfig.provider);

  const handleProviderChange = (providerId: string) => {
    setLocalConfig(prev => ({
      ...prev,
      provider: providerId,
      // Keep existing values if switching back
      baseUrl: providerId === 'openai-compatible' ? 'http://localhost:11434/v1' : '',
      model: prev.provider === providerId ? prev.model : ''
    }));
    setModels([]);
  };

  const fetchModels = () => {
    if (!localConfig.apiKey) return;
    setIsLoadingModels(true);
    const payload: WebviewMessage = { 
      type: 'fetchModels', 
      provider: localConfig.provider,
      apiKey: localConfig.apiKey
    };
    postMessage(payload);
  };

  const handleSave = () => {
    // Save current local config directly
    onSave(localConfig);
    onClose();
  };

  const filteredModels = models.filter(m => {
    if (onlyFree && !m.isFree) return false;
    if (modelSearch && !m.name.toLowerCase().includes(modelSearch.toLowerCase()) && !m.id.toLowerCase().includes(modelSearch.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2>⚙️ Settings</h2>
          <button className="close-button" onClick={onClose}>✕</button>
        </div>

        <div className="settings-content">
          {/* Provider Selection */}
          <div className="settings-section">
            <label className="settings-label">Provider</label>
            <div className="provider-grid">
              {PROVIDERS.map(provider => (
                <button
                  key={provider.id}
                  className={`provider-card ${localConfig.provider === provider.id ? 'active' : ''}`}
                  onClick={() => handleProviderChange(provider.id)}
                >
                  <span className="provider-name">{provider.name}</span>
                  <span className="provider-desc">{provider.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Base URL for OpenAI-compatible */}
          {localConfig.provider === 'openai-compatible' && (
            <div className="settings-section">
              <label className="settings-label">Base URL</label>
              <input
                type="text"
                className="settings-input"
                value={localConfig.baseUrl}
                onChange={e => setLocalConfig({ ...localConfig, baseUrl: e.target.value })}
                placeholder="http://localhost:11434/v1"
              />
            </div>
          )}

          {/* API Key */}
          {currentProvider?.requiresApiKey && (
            <div className="settings-section">
              <label className="settings-label">API Key</label>
              <div className="api-key-wrapper">
                <input
                  type="password"
                  className="settings-input"
                  value={localConfig.apiKey}
                  onChange={e => setLocalConfig({ ...localConfig, apiKey: e.target.value })}
                  placeholder={`Enter your ${currentProvider.name} API key`}
                />
                {currentProvider.hasDynamicModels && (
                  <button 
                    className="fetch-button"
                    onClick={fetchModels}
                    disabled={!localConfig.apiKey || isLoadingModels}
                  >
                    {isLoadingModels ? 'Fetching...' : 'Get Models'}
                  </button>
                )}
              </div>
              {localConfig.provider === 'openrouter' && (
                <p className="settings-hint">
                  Get your key at <a href="https://openrouter.ai/keys" target="_blank">openrouter.ai</a>
                </p>
              )}
            </div>
          )}

          {/* Model Selection */}
          <div className="settings-section">
            <label className="settings-label">Model</label>
            
            {currentProvider?.hasDynamicModels && models.length > 0 ? (
              <div className="model-selector">
                <div className="model-search-bar">
                  <input
                    type="text"
                    className="settings-input search-input"
                    placeholder="Search models..."
                    value={modelSearch}
                    onChange={e => setModelSearch(e.target.value)}
                  />
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={onlyFree}
                      onChange={e => setOnlyFree(e.target.checked)}
                    />
                    Free only
                  </label>
                </div>
                
                <div className="model-list">
                  {filteredModels.map(model => (
                    <button
                      key={model.id}
                      className={`model-item ${localConfig.model === model.id ? 'active' : ''}`}
                      onClick={() => setLocalConfig({ ...localConfig, model: model.id })}
                    >
                      <div className="model-info">
                        <span className="model-name">{model.name}</span>
                        <span className="model-id">{model.id}</span>
                      </div>
                      {model.isFree && <span className="free-badge">FREE</span>}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="manual-model-input">
                <input
                  type="text"
                  className="settings-input"
                  value={localConfig.model}
                  onChange={e => setLocalConfig({ ...localConfig, model: e.target.value })}
                  placeholder="Enter model ID (e.g. google/gemini-2.0-flash-exp:free)"
                />
              </div>
            )}
          </div>

          {/* Agent Mode */}
          <div className="settings-section">
            <label className="settings-label">Agent Mode</label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={!!localConfig.autoApprove}
                onChange={e => setLocalConfig({ ...localConfig, autoApprove: e.target.checked })}
              />
              Auto-approve tool actions and file changes
            </label>
          </div>
        </div>

        <div className="settings-footer">
          <button className="cancel-button" onClick={onClose}>Cancel</button>
          <button className="save-button" onClick={handleSave}>Save Settings</button>
        </div>
      </div>
    </div>
  );
}
