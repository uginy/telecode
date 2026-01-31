@golden @priority-low
Feature: Multi-root workspace

  Background:
    Given workspace открыт в VS Code
    And workspace содержит два корня: "app" и "shared"
    And сессия пустая (нет ранее собранного контекста)

  Scenario: Пользователь спрашивает про общие утилиты
    When пользователь пишет "где лежат общие утилиты?"
    Then tool calls в порядке:
      | step | tool       | args |
      | 1 | list_files | { "path": "app" } |
      | 2 | list_files | { "path": "shared" } |
    And ассистент отвечает, ссылаясь на нужный корень
