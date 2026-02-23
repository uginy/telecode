/**
 * i18n.ts
 * Centralized internationalization service for TeleCode AI.
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
  option_auto: string;
  btn_view_grouped: string;
  btn_view_list: string;

  // UI - Settings General
  settings_general_title: string;
  settings_general_desc: string;

  // UI - Settings About
  settings_about_title: string;
  settings_about_desc: string;
  about_version: string;
  about_feature_agent: string;
  about_feature_files: string;
  about_feature_terminal: string;
  about_feature_remote: string;
  about_feature_multimodal: string;
  about_feature_i18n: string;

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
  field_log_max_chars: string;
  field_log_max_chars_hint: string;
  field_tg_log_lines: string;
  field_tg_log_lines_hint: string;

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
  
  // Telegram phases
  tg_studying_request: string;
  tg_phase_preparing: string;
  tg_phase_running_agent: string;
  tg_phase_analyzing: string;
  tg_phase_planning: string;
  tg_phase_reviewing: string;
  tg_phase_using_tools: string;
  tg_phase_finalizing: string;
  tg_phase_done: string;
  tg_tool_searching: string;
  tg_tool_editing: string;
  tg_tool_executing: string;
  tg_tool_testing: string;
  tg_tool_git: string;
  tg_status_running: string;
  tg_status_idle: string;
  tg_status_error: string;
  tg_label_status: string;
  tg_label_phase: string;
  tg_label_provider: string;
  tg_label_model: string;
  tg_label_style: string;
  tg_label_language: string;
  tg_help_title: string;
  tg_cmd_status: string;
  tg_cmd_settings: string;
  tg_cmd_run: string;
  tg_cmd_stop: string;
  tg_cmd_last: string;
  tg_cmd_logs: string;
  tg_cmd_changes: string;
  tg_cmd_diff: string;
  tg_cmd_rollback: string;
  tg_cmd_provider: string;
  tg_cmd_model: string;
  tg_cmd_help: string;
  tg_bot_online: string;
  tg_denied: string;
  tg_connected: string;
  tg_lifecycle_starting: string;
  tg_lifecycle_stopping: string;
  tg_lifecycle_stopped: string;
  tg_lifecycle_start_failed: string;
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
    option_auto: 'Авто',
    btn_view_grouped: 'Группа',
    btn_view_list: 'Список',

    settings_general_title: 'Общие',
    settings_general_desc: 'Глобальные настройки приложения.',

    settings_about_title: 'О программе',
    settings_about_desc: 'Информация о возможностях TeleCode AI.',
    about_version: 'Версия',
    about_feature_agent: 'Автономный агент (pi-agent-core) для решения сложных задач по кодингу.',
    about_feature_files: 'Прямая работа с файловой системой (чтение, поиск, умное редактирование).',
    about_feature_terminal: 'Исполнение команд в безопасном терминале VS Code.',
    about_feature_remote: 'Дистанционное управление через Telegram и WhatsApp.',
    about_feature_multimodal: 'Поддержка мультимодальных моделей (анализ изображений).',
    about_feature_i18n: 'Полная многоязычность (интерфейс и ответы агента).',

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
    field_log_max_chars: 'Буфер логов (симв.)',
    field_log_max_chars_hint: 'Максимальный размер логов в UI в памяти перед обрезкой старых строк.',
    field_tg_log_lines: 'Линии Telegram-логов',
    field_tg_log_lines_hint: 'Максимальное число строк Telegram-логов в памяти.',

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
  
    tg_studying_request: 'Изучаю ваш запрос...',
    tg_phase_preparing: 'Готовлюсь к ответу...',
    tg_phase_running_agent: 'Запускаю агента...',
    tg_phase_analyzing: 'Разбираюсь в задаче...',
    tg_phase_planning: 'Планирую решение...',
    tg_phase_reviewing: 'Проверяю результат...',
    tg_phase_using_tools: 'Использую инструменты...',
    tg_phase_finalizing: 'Завершаю работу...',
    tg_phase_done: 'Готово, отправляю!',
    tg_tool_searching: 'Поиск и анализ кода',
    tg_tool_editing: 'Фикшу баг и вношу правки',
    tg_tool_executing: 'Запускаю команды и проверяю проект',
    tg_tool_testing: 'Проверяю качество: тесты и линт',
    tg_tool_git: 'Проверяю изменения в git',
    tg_status_running: 'выполняется',
    tg_status_idle: 'ожидание',
    tg_status_error: 'ошибка',
    tg_label_status: 'статус',
    tg_label_phase: 'фаза',
    tg_label_provider: 'провайдер',
    tg_label_model: 'модель',
    tg_label_style: 'стиль',
    tg_label_language: 'язык',
    tg_help_title: 'Команды TeleCode AI Telegram:',
    tg_cmd_status: 'статус выполнения и модели',
    tg_cmd_settings: 'снимок текущих настроек',
    tg_cmd_run: 'запустить задачу',
    tg_cmd_stop: 'остановить активный запуск',
    tg_cmd_last: 'показать последний ответ',
    tg_cmd_logs: 'недавние логи (по умолчанию 20)',
    tg_cmd_changes: 'состояние git-репозитория',
    tg_cmd_diff: 'git diff для файла',
    tg_cmd_rollback: 'откатить изменения до HEAD',
    tg_cmd_provider: 'сменить провайдера',
    tg_cmd_model: 'сменить модель',
    tg_cmd_help: 'это сообщение',
    tg_bot_online: 'Бот TeleCode AI онлайн. Используйте /help для просмотра команд.',
    tg_denied: 'Доступ запрещен для User ID {id}. Обновите telecode.telegram.chatId в настройках.',
    tg_connected: 'TeleCode AI подключен. Отправьте /status',
    tg_lifecycle_starting: 'Запускаю бота TeleCode AI...',
    tg_lifecycle_stopping: 'Останавливаю бота TeleCode AI...',
    tg_lifecycle_stopped: 'Бот TeleCode AI остановлен.',
    tg_lifecycle_start_failed: 'Не удалось запустить бота TeleCode AI: {error}',
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
    option_auto: 'Auto',
    btn_view_grouped: 'Group',
    btn_view_list: 'List',

    settings_general_title: 'General',
    settings_general_desc: 'Global application preferences.',

    settings_about_title: 'About',
    settings_about_desc: 'Capabilities of TeleCode AI.',
    about_version: 'Version',
    about_feature_agent: 'Autonomous agent (pi-agent-core) for solving complex coding tasks.',
    about_feature_files: 'Direct file system access (read, search, smart editing).',
    about_feature_terminal: 'Safe command execution in VS Code terminal.',
    about_feature_remote: 'Remote control via Telegram and WhatsApp.',
    about_feature_multimodal: 'Multimodal model support (vison/image analysis).',
    about_feature_i18n: 'Full multi-language support (UI and responses).',

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
    field_log_max_chars: 'Log Buffer (chars)',
    field_log_max_chars_hint: 'Maximum in-memory UI log buffer size before trimming old lines.',
    field_tg_log_lines: 'Telegram Log Lines',
    field_tg_log_lines_hint: 'Maximum number of Telegram log lines kept in memory.',

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
  
    tg_studying_request: 'Studying your request...',
    tg_phase_preparing: 'Preparing response...',
    tg_phase_running_agent: 'Starting agent...',
    tg_phase_analyzing: 'Analyzing the task...',
    tg_phase_planning: 'Planning the solution...',
    tg_phase_reviewing: 'Reviewing the result...',
    tg_phase_using_tools: 'Using tools...',
    tg_phase_finalizing: 'Finalizing...',
    tg_phase_done: 'Done, sending!',
    tg_tool_searching: 'Searching and analyzing code',
    tg_tool_editing: 'Fixing bugs and making edits',
    tg_tool_executing: 'Running commands and checking project',
    tg_tool_testing: 'Quality check: tests and lint',
    tg_tool_git: 'Checking git changes',
    tg_status_running: 'running',
    tg_status_idle: 'idle',
    tg_status_error: 'error',
    tg_label_status: 'status',
    tg_label_phase: 'phase',
    tg_label_provider: 'provider',
    tg_label_model: 'model',
    tg_label_style: 'style',
    tg_label_language: 'language',
    tg_help_title: 'TeleCode AI Telegram commands:',
    tg_cmd_status: 'runtime and model status',
    tg_cmd_settings: 'current config snapshot',
    tg_cmd_run: 'run task',
    tg_cmd_stop: 'stop active run',
    tg_cmd_last: 'show last answer',
    tg_cmd_logs: 'recent logs (default 20)',
    tg_cmd_changes: 'git working tree summary',
    tg_cmd_diff: 'git diff for file',
    tg_cmd_rollback: 'restore changed files to HEAD',
    tg_cmd_provider: 'switch provider',
    tg_cmd_model: 'switch model',
    tg_cmd_help: 'this message',
    tg_bot_online: 'TeleCode AI bot is online. Use /help to see commands.',
    tg_denied: 'Access denied for User ID {id}. Update telecode.telegram.chatId in settings.',
    tg_connected: 'TeleCode AI connected. Send /status',
    tg_lifecycle_starting: 'Starting TeleCode AI bot...',
    tg_lifecycle_stopping: 'Stopping TeleCode AI bot...',
    tg_lifecycle_stopped: 'TeleCode AI bot stopped.',
    tg_lifecycle_start_failed: 'Failed to start TeleCode AI bot: {error}',
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
