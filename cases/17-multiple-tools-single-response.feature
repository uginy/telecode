@golden @priority-high
Feature: Несколько tool calls в одном ответе

  Background:
    Given workspace открыт в VS Code
    And сессия пустая (нет ранее собранного контекста)
    And настройки:
      | key | value |
      | autoApprove | true |

  Scenario: Ассистент вызывает два инструмента в одном сообщении
    When пользователь пишет "покажи структуру проекта и README"
    Then tool calls в порядке:
      | step | tool      | args |
      | 1 | list_files | { "path": "." } |
      | 2 | read_file | { "path": "README.md" } |
    And tool timeline показывает оба tool calls как отдельные записи
    And tool results связываются с правильными tool calls
