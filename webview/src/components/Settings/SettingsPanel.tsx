import { useState } from 'react';

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
}

const PROVIDERS = [
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

const PRESET_URLS = [
  { label: 'Ollama (local)', url: 'http://localhost:11434/v1' },
  { label: 'LM Studio (local)', url: 'http://localhost:1234/v1' },
  { label: 'OpenRouter', url: 'https://openrouter.ai/api/v1' },
  { label: 'Custom', url: '' }
];

const MODELS_BY_PROVIDER: Record<string, string[]> = {
  'openai-compatible': [
    'llama3.2',
    'qwen2.5-coder:7b',
    'deepseek-coder-v2',
    'codestral',
    'mistral',
  ],
  'anthropic': [
    'claude-sonnet-4-20250514',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229'
  ],
  'openai': [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'o1-preview',
    'o1-mini'
  ]
};

export function SettingsPanel({ isOpen, onClose, config, onSave }: SettingsPanelProps) {
  const [localConfig, setLocalConfig] = useState<SettingsConfig>(config);
  const [customModel, setCustomModel] = useState('');

  if (!isOpen) return null;

  const currentProvider = PROVIDERS.find(p => p.id === localConfig.provider);
  const availableModels = MODELS_BY_PROVIDER[localConfig.provider] || [];

  const handleProviderChange = (providerId: string) => {
    const models = MODELS_BY_PROVIDER[providerId] || [];
    setLocalConfig({
      ...localConfig,
      provider: providerId,
      model: models[0] || '',
      baseUrl: providerId === 'openai-compatible' ? 'http://localhost:11434/v1' : '',
      apiKey: ''
    });
  };

  const handleSave = () => {
    const finalConfig = {
      ...localConfig,
      model: customModel || localConfig.model
    };
    onSave(finalConfig);
    onClose();
  };

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
                  {provider.requiresApiKey && (
                    <span className="provider-badge">API Key</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Base URL for OpenAI-compatible */}
          {localConfig.provider === 'openai-compatible' && (
            <div className="settings-section">
              <label className="settings-label">Base URL</label>
              <div className="preset-buttons">
                {PRESET_URLS.map(preset => (
                  <button
                    key={preset.label}
                    className={`preset-button ${localConfig.baseUrl === preset.url ? 'active' : ''}`}
                    onClick={() => setLocalConfig({ ...localConfig, baseUrl: preset.url })}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
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
              <input
                type="password"
                className="settings-input"
                value={localConfig.apiKey}
                onChange={e => setLocalConfig({ ...localConfig, apiKey: e.target.value })}
                placeholder={`Enter your ${currentProvider.name} API key`}
              />
            </div>
          )}

          {/* Model Selection */}
          <div className="settings-section">
            <label className="settings-label">Model</label>
            <div className="model-grid">
              {availableModels.map(model => (
                <button
                  key={model}
                  className={`model-button ${localConfig.model === model ? 'active' : ''}`}
                  onClick={() => {
                    setLocalConfig({ ...localConfig, model });
                    setCustomModel('');
                  }}
                >
                  {model}
                </button>
              ))}
            </div>
            <input
              type="text"
              className="settings-input"
              value={customModel || (availableModels.includes(localConfig.model) ? '' : localConfig.model)}
              onChange={e => setCustomModel(e.target.value)}
              placeholder="Or enter custom model name..."
            />
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
