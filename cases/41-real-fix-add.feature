@real @golden @priority-high @id:real-fix-add
Feature: Real LLM - исправление бага

  Background:
    Given workspace открыт в VS Code
    And сессия пустая (нет ранее собранного контекста)

  Scenario: Исправить add в src/math.ts
    When пользователь пишет "Исправь функцию add"
    Then tool calls в порядке:
      | step | tool            | args |
      | 1 | read_file | { "path": "src/math.ts" } |
      | 2 | replace_in_file | { "path": "src/math.ts", "content": "<patch>" } |
    And ассистент пишет краткий отчет
