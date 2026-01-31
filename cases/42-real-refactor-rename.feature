@real @golden @priority-high @id:real-refactor-rename
Feature: Real LLM - рефакторинг переменной

  Background:
    Given workspace открыт в VS Code
    And сессия пустая (нет ранее собранного контекста)

  Scenario: Переименовать переменную в src/strings.ts
    When пользователь пишет "Переименуй badName в goodName"
    Then tool calls в порядке:
      | step | tool            | args |
      | 1 | read_file | { "path": "src/strings.ts" } |
      | 2 | replace_in_file | { "path": "src/strings.ts", "content": "<patch>" } |
    And ассистент пишет краткий отчет
