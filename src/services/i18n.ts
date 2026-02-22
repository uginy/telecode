/**
 * i18n.ts
 * Centralized internationalization service for AIS Code.
 */

export type Language = 'ru' | 'en';

export interface Translations {
  // Runtime statuses
  tools_available: string;
  prompt_stack: string;
  prompt_stack_missing: string;
  llm_config: string;
  tool_execution_start: string;
  tool_execution_update: string;
  tool_execution_end: string;
  agent_start: string;
  turn_start: string;
  message_start: string;
  message_end: string;
  turn_end: string;
  agent_end: string;

  // UI - Tabs & General
  tab_logs: string;
  tab_settings: string;
  btn_save_settings: string;
  btn_start: string;
  btn_stop: string;
  btn_run: string;
  prompt_placeholder: string;

  // UI - Settings Inference
  settings_inference_title: string;
  settings_inference_desc: string;
  field_provider: string;
  field_provider_hint: string;
  field_base_url: string;
  field_base_url_hint: string;
  field_api_key: string;
  field_api_key_hint: string;
  field_model: string;
  field_model_hint: string;
  field_response_style: string;
  field_response_style_hint: string;
  field_language: string;
  field_language_hint: string;
  field_ui_language: string;
  field_ui_language_hint: string;
  field_max_steps: string;
  field_max_steps_hint: string;

  // UI - Settings Telegram
  settings_telegram_title: string;
  settings_telegram_desc: string;
  field_telegram_enabled: string;
  field_telegram_enabled_hint: string;
  field_telegram_token: string;
  field_telegram_token_hint: string;
  field_telegram_chat_id: string;
  field_telegram_chat_id_hint: string;
  field_telegram_api_root: string;
  field_telegram_api_root_hint: string;
  field_telegram_force_ipv4: string;
  field_telegram_force_ipv4_hint: string;
}

const TRANSLATIONS: Record<Language, Translations> = {
  ru: {
    tools_available: 'Инструменты загружены',
    prompt_stack: 'Стек промптов',
    prompt_stack_missing: 'Отсутствующие слои промпта',
    llm_config: 'Конфигурация LLM',
    tool_execution_start: 'Начинаю инструмент',
    tool_execution_update: 'Выполняю инструмент',
    tool_execution_end: 'Завершил инструмент',
    agent_start: 'Агент запущен',
    turn_start: 'Новый шаг рассуждения',
    message_start: 'Формирую ответ',
    message_end: 'Ответ сформирован',
    turn_end: 'Шаг завершен',
    agent_end: 'Выполнение завершено',

    tab_logs: 'Логи',
    tab_settings: 'Настройки',
    btn_save_settings: 'Сохранить настройки',
    btn_start: 'Запустить',
    btn_stop: 'Остановить',
    btn_run: 'Пуск ▶',
    prompt_placeholder: 'Опишите задачу...',

    settings_inference_title: 'Инференс',
    settings_inference_desc: 'Настройка модели и API для работы агента.',
    field_provider: 'Провайдер',
    field_provider_hint: 'Имя провайдера (например: openai, anthropic, moonshot).',
    field_base_url: 'Base URL',
    field_base_url_hint: 'Кастомный эндпоинт API. Оставьте пустым для значений по умолчанию.',
    field_api_key: 'API Key',
    field_api_key_hint: 'Секретный ключ провайдера. Никогда не передается третьим лицам.',
    field_model: 'Модель',
    field_model_hint: 'ID модели (например: gpt-4o, claude-opus-4-5).',
    field_response_style: 'Стиль ответов',
    field_response_style_hint: 'Насколько подробными должны быть ответы агента.',
    field_language: 'Язык общения',
    field_language_hint: 'Язык, на котором будет отвечать агент.',
    field_ui_language: 'Язык интерфейса',
    field_ui_language_hint: 'Язык меню, вкладок и настроек расширения.',
    field_max_steps: 'Макс. шагов',
    field_max_steps_hint: 'Максимальное количество вызовов инструментов (1–1000).',

    settings_telegram_title: 'Telegram Бот',
    settings_telegram_desc: 'Управление задачами через внешнего бота.',
    field_telegram_enabled: 'Включить Telegram бота',
    field_telegram_enabled_hint: 'Запускать бота вместе с агентом.',
    field_telegram_token: 'Токен бота',
    field_telegram_token_hint: 'Токен от @BotFather.',
    field_telegram_chat_id: 'Chat ID',
    field_telegram_chat_id_hint: 'Ваш ID или ID группы для доступа к боту.',
    field_telegram_api_root: 'API Root',
    field_telegram_api_root_hint: 'Адрес сервера Telegram (оставьте пустым для стандартного).',
    field_telegram_force_ipv4: 'Форсировать IPv4',
    field_telegram_force_ipv4_hint: 'Рекомендуется для macOS — решает проблемы с IPv6.',
  },
  en: {
    tools_available: 'Tools loaded',
    prompt_stack: 'Prompt stack',
    prompt_stack_missing: 'Prompt stack missing',
    llm_config: 'LLM config',
    tool_execution_start: 'Starting tool',
    tool_execution_update: 'Executing tool',
    tool_execution_end: 'Completed tool',
    agent_start: 'Agent started',
    turn_start: 'New reasoning step',
    message_start: 'Generating response',
    message_end: 'Response generated',
    turn_end: 'Step completed',
    agent_end: 'Execution completed',

    tab_logs: 'Logs',
    tab_settings: 'Settings',
    btn_save_settings: 'Save Settings',
    btn_start: 'Start',
    btn_stop: 'Stop',
    btn_run: 'Run ▶',
    prompt_placeholder: 'Describe the task...',

    settings_inference_title: 'Inference',
    settings_inference_desc: 'Model and API configuration for the agent loop.',
    field_provider: 'Provider',
    field_provider_hint: 'Provider name (e.g. openai, anthropic, moonshot).',
    field_base_url: 'Base URL',
    field_base_url_hint: 'Custom API endpoint. Leave blank to use provider default.',
    field_api_key: 'API Key',
    field_api_key_hint: 'Secret key for the selected provider. Never shared.',
    field_model: 'Model',
    field_model_hint: 'Model ID (e.g. gpt-4o, claude-opus-4-5).',
    field_response_style: 'Response Style',
    field_response_style_hint: 'Style of text responses from the agent.',
    field_language: 'Response Language',
    field_language_hint: "Agent's response language.",
    field_ui_language: 'UI Language',
    field_ui_language_hint: 'Language for tabs, buttons and settings.',
    field_max_steps: 'Max Steps',
    field_max_steps_hint: 'Max tool calls allowed per task (1–1000).',

    settings_telegram_title: 'Telegram Bot',
    settings_telegram_desc: 'Receive and respond to tasks via a Telegram bot.',
    field_telegram_enabled: 'Enable Telegram Bot',
    field_telegram_enabled_hint: 'Start the bot when the agent is running.',
    field_telegram_token: 'Bot Token',
    field_telegram_token_hint: 'Token from @BotFather.',
    field_telegram_chat_id: 'Chat ID',
    field_telegram_chat_id_hint: 'Your Telegram ID or group ID allowed to send tasks.',
    field_telegram_api_root: 'API Root',
    field_telegram_api_root_hint: 'Custom API server URL (leave blank for default).',
    field_telegram_force_ipv4: 'Force IPv4',
    field_telegram_force_ipv4_hint: 'Recommended for macOS — avoids IPv6 issues.',
  }
};

export class I18nService {
  private currentLanguage: Language = 'ru';

  constructor(lang = 'ru') {
    this.setLanguage(lang);
  }

  public setLanguage(lang: string): void {
    this.currentLanguage = (lang === 'en' || lang === 'ru') ? lang : 'ru';
  }

  public get t(): Translations {
    return TRANSLATIONS[this.currentLanguage];
  }

  public getTranslations(): Translations {
    return this.t;
  }

  /**
   * Formats a raw runtime message into a localized human-readable status.
   */
  public formatStatus(message: string): string {
    const t = this.t;
    
    // Prefix based translations
    if (message.startsWith('tools_available ')) {
      return `${t.tools_available}: ${message.replace('tools_available ', '')}`;
    }
    if (message.startsWith('prompt_stack ')) {
      return `${t.prompt_stack}: ${message.replace('prompt_stack ', '')}`;
    }
    if (message.startsWith('llm_config ')) {
      return `${t.llm_config}: ${message.replace('llm_config ', '')}`;
    }
    if (message.startsWith('tool_execution_start:')) {
      return `${t.tool_execution_start}: ${message.replace('tool_execution_start:', '')}`;
    }
    if (message.startsWith('tool_execution_update:')) {
      return `${t.tool_execution_update}: ${message.replace('tool_execution_update:', '')}`;
    }
    if (message.startsWith('tool_execution_end:')) {
      return `${t.tool_execution_end}: ${message.replace('tool_execution_end:', '')}`;
    }

    // Special formatting for missing prompt layers
    if (message.startsWith('prompt_stack_missing ')) {
      const raw = message.replace('prompt_stack_missing ', '').trim();
      const items = raw.split(',').map(i => i.trim()).filter(i => i.length > 0);
      const prefix = t.prompt_stack_missing;
      if (items.length <= 4) {
        return `${prefix}: ${items.join(', ')}`;
      }
      return `${prefix}: ${items.slice(0, 3).join(', ')} (+${items.length - 3} more)`;
    }

    // Exact match lookup
    const exactMatch = (t as unknown as Record<string, string>)[message];
    return exactMatch || message;
  }
}

/** Global singleton for i18n */
export const i18n = new I18nService();
