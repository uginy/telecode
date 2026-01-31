@golden @priority-medium
Feature: Настройки источников контекста

  Background:
    Given workspace открыт в VS Code
    And сессия пустая (нет ранее собранного контекста)
    And открыты вкладки: "src/extension.ts", "src/panels/ChatViewProvider.ts"

  Scenario: Отключены открытые вкладки
    Given настройки:
      | key | value |
      | contextUseOpenTabs | false |
      | contextUseSemantic | true |
    When пользователь пишет "где реализован запуск чата?"
    Then плагин не использует открытые вкладки
    And tool calls в порядке:
      | step | tool            | args |
      | 1 | codebase_search | { "query": "openChat", "path": null } |
      | 2 | read_file | { "path": "<top-result-file>" } |
    And ассистент отвечает кратко и по делу
