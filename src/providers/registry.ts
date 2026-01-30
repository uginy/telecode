import type { AIProvider } from './base';
import { AnthropicProvider } from './anthropic';
import { OpenAIProvider } from './openai';
import { OpenAICompatibleProvider } from './openai-compatible';

/**
 * Registry for AI providers
 * Manages provider instances and selection
 */
export class ProviderRegistry {
  private _providers: Map<string, AIProvider> = new Map();

  constructor() {
    // Register built-in providers
    this.register(new OpenAICompatibleProvider()); // First - always available
    this.register(new AnthropicProvider());
    this.register(new OpenAIProvider());
  }

  /**
   * Register a new provider
   */
  register(provider: AIProvider): void {
    this._providers.set(provider.name, provider);
  }

  /**
   * Get a provider by name
   */
  async getProvider(name: string): Promise<AIProvider | undefined> {
    const provider = this._providers.get(name);
    
    if (provider && !provider.isConfigured()) {
      return undefined;
    }
    
    return provider;
  }

  /**
   * Get all available (configured) providers
   */
  getAvailableProviders(): AIProvider[] {
    return Array.from(this._providers.values()).filter(p => p.isConfigured());
  }

  /**
   * Get all registered providers (including unconfigured)
   */
  getAllProviders(): AIProvider[] {
    return Array.from(this._providers.values());
  }

  /**
   * Check if any provider is configured
   */
  hasConfiguredProvider(): boolean {
    return this.getAvailableProviders().length > 0;
  }

  /**
   * Get provider names
   */
  getProviderNames(): string[] {
    return Array.from(this._providers.keys());
  }
}
