Feature: Архитектурный анализ проекта

  Scenario: Пользователь просит архитектурные особенности проекта
    Given открыты вкладки "src/extension.ts" и "src/panels/ChatViewProvider.ts"
    And в чате нет ранее собранного контекста по проекту
    When пользователь пишет "проанализируй проект и скажи его архитектурные особенности"
    Then плагин включает статусы "building_context" и "searching_codebase"
    And вызывает tools в последовательности:
      | tool            | args                      |
      | list_files      | { "path": "." }           |
      | read_file       | { "path": "package.json"} |
      | read_file       | { "path": "README.md" }   |
      | codebase_search | { "query": "architecture", "path": null } |
      | codebase_search | { "query": "context", "path": null } |
    And ассистент дает структурированный ответ о слоях, потоках данных и ключевых модулях
    And в конце предлагает 1-2 уточняющих вопроса (если информации мало)
