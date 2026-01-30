import { useEffect, useMemo, useState } from 'react';
import { useVSCode } from '../../hooks/useVSCode';
import { useSettingsStore } from '../../stores/settingsStore';
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
  maxTokens?: number;
  temperature?: number;
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

const SETTINGS_SECTIONS = [
  { id: 'general', label: 'General', icon: '4cc', keywords: ['general', 'provider', 'model', 'api', 'key'] },
  { id: 'provider', label: 'Providers', icon: '310', keywords: ['provider', 'openrouter', 'openai', 'anthropic', 'ollama'] },
  { id: 'model', label: 'Models', icon: '9e0', keywords: ['model', 'free', 'search'] },
  { id: 'agent', label: 'Agent Mode', icon: '916', keywords: ['agent', 'auto-approve', 'approve'] },
  { id: 'advanced', label: 'Advanced', icon: '9f0', keywords: ['advanced', 'base url'] }
];

export function SettingsPanel({ isOpen, onClose, config, onSave }: SettingsPanelProps) {
  const { postMessage } = useVSCode();
  const { searchQuery, setSearchQuery, activeSectionId, setActiveSectionId } = useSettingsStore();
  const [localConfig, setLocalConfig] = useState<SettingsConfig>(config);
  const [models, setModels] = useState<Model[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [onlyFree, setOnlyFree] = useState(true);

  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

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
    onSave(localConfig);
    onClose();
  };

  const filteredModels = models.filter(m => {
    if (onlyFree && !m.isFree) return false;
    if (modelSearch && !m.name.toLowerCase().includes(modelSearch.toLowerCase()) && !m.id.toLowerCase().includes(modelSearch.toLowerCase())) return false;
    return true;
  });

  const lowerSearch = searchQuery.trim().toLowerCase();
  const visibleSections = useMemo(() => {
    if (!lowerSearch) return SETTINGS_SECTIONS;
    return SETTINGS_SECTIONS.filter(section =>
      section.label.toLowerCase().includes(lowerSearch) ||
      section.keywords.some(keyword => keyword.toLowerCase().includes(lowerSearch))
    );
  }, [lowerSearch]);

  const scrollToSection = (id: string) => {
    setActiveSectionId(id);
    const el = document.getElementById(`settings-section-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="settings-page">
      <div className="settings-page-header">
        <div className="settings-page-title">
          <span className="settings-page-icon">6e0e0f</span>
          <div>
            <div className="settings-page-title-text">Settings</div>
            <div className="settings-page-subtitle">Configure AIS Code to match your workflow</div>
          </div>
        </div>
        <div className="settings-page-actions">
          <button className="settings-page-button" onClick={onClose}>Back</button>
          <button className="settings-page-button primary" onClick={handleSave}>Save</button>
        </div>
      </div>

      <div className="settings-page-body">
        <aside className="settings-drawer">
          <div className="settings-search">
            <input
              type="text"
              className="settings-search-input"
              placeholder="Search settings..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="settings-nav">
            {visibleSections.map(section => (
              <button
                key={section.id}
                className={`settings-nav-item ${activeSectionId === section.id ? 'active' : ''}`}
                onClick={() => scrollToSection(section.id)}
              >
                <span className="settings-nav-icon">{section.icon}</span>
                <span>{section.label}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="settings-content-area">
          <section id="settings-section-general" className="settings-section-block">
            <h3>4cc General</h3>
            <p className="settings-section-desc">Core defaults for provider and model selection.</p>

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
          </section>

          <section id="settings-section-provider" className="settings-section-block">
            <h3>310 Providers</h3>
            <p className="settings-section-desc">Credentials and base endpoints for the selected provider.</p>

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
                    Get your key at <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">openrouter.ai</a>
                  </p>
                )}
              </div>
            )}
          </section>

          <section id="settings-section-model" className="settings-section-block">
            <h3>9e0 Models</h3>
            <p className="settings-section-desc">Pick the model and limit free-only results.</p>

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
          </section>

          <section id="settings-section-agent" className="settings-section-block">
            <h3>916 Agent Mode</h3>
            <p className="settings-section-desc">Agent mode lets AIS Code auto-approve actions.</p>

            <div className="settings-section">
              <label className="settings-label">Auto-Approve</label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={!!localConfig.autoApprove}
                  onChange={e => setLocalConfig({ ...localConfig, autoApprove: e.target.checked })}
                />
                Auto-approve tool actions and file changes
              </label>
            </div>
          </section>

          <section id="settings-section-advanced" className="settings-section-block">
            <h3>9f0 Advanced</h3>
            <p className="settings-section-desc">Tune advanced controls for long-term usage.</p>

            <div className="settings-section">
              <label className="settings-label">Max Tokens</label>
              <input
                type="number"
                className="settings-input"
                value={localConfig.maxTokens ?? ''}
                onChange={e => setLocalConfig({ ...localConfig, maxTokens: Number(e.target.value) || undefined })}
                placeholder="4096"
              />
            </div>

            <div className="settings-section">
              <label className="settings-label">Temperature</label>
              <input
                type="number"
                className="settings-input"
                value={localConfig.temperature ?? ''}
                onChange={e => setLocalConfig({ ...localConfig, temperature: Number(e.target.value) || undefined })}
                placeholder="0.7"
                step="0.1"
                min="0"
                max="2"
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
