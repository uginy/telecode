@edge @priority-high
Feature: Некорректный JSON внутри tool call

  Background:
    Given workspace открыт в VS Code
    And сессия пустая (нет ранее собранного контекста)

  Scenario: codebase_search с битым JSON
    When ассистент возвращает "<codebase_search>{bad json</codebase_search>"
    Then tool calls в порядке:
      | step | tool            | args |
      | 1 | codebase_search | { "query": "{bad json" } |
    And ассистент не падает
