Feature: Исправление бага по открытым вкладкам

  Scenario: Пользователь просит исправить ошибку, не указывая файл
    Given открыты вкладки "src/core/agent/AgentOrbit.ts" и "src/panels/chatView/sendMessage.ts"
    When пользователь пишет "/fix падает при null path в codebase_search"
    Then плагин использует контекст открытых вкладок
    And вызывает tools в последовательности:
      | tool      | args                                 |
      | read_file | { "path": "src/core/tools/toolParsing.ts" } |
    And ассистент применяет исправление через:
      | tool            | args                      |
      | replace_in_file | { "path": "src/core/tools/toolParsing.ts", "content": "<patch>" } |
    And в конце пишет краткий отчет об исправлении
