@edge @priority-high
Feature: Результаты tools приходят не по порядку

  Background:
    Given workspace открыт в VS Code
    And сессия пустая (нет ранее собранного контекста)

  Scenario: tool results приходят в другом порядке
    Given ассистент вызвал tools:
      | step | tool      | args |
      | 1 | read_file | { "path": "README.md" } |
      | 2 | list_files | { "path": "." } |
    When tool results приходят в порядке 2 -> 1
    Then tool timeline связывает результаты по toolCallId
    And статусы обоих tools корректны
