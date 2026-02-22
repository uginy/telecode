/**
 * i18n.ts
 * Centralized internationalization service for AIS Code.
 */

export type Language = 'ru' | 'en';

export interface Translations {
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
  }
};

export class I18nService {
  private currentLanguage: Language = 'ru';

  constructor(lang: string = 'ru') {
    this.setLanguage(lang);
  }

  public setLanguage(lang: string): void {
    this.currentLanguage = (lang === 'en' || lang === 'ru') ? lang : 'ru';
  }

  public get t(): Translations {
    return TRANSLATIONS[this.currentLanguage];
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
