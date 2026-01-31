@golden @priority-medium
Feature: Ошибка чтения директории

  Background:
    Given workspace открыт в VS Code
    And сессия пустая (нет ранее собранного контекста)

  Scenario: read_file указывает на директорию
    When пользователь пишет "прочитай папку src и скажи что внутри"
    Then tool calls в порядке:
      | step | tool      | args |
      | 1 | read_file | { "path": "src" } |
    And если read_file возвращает ошибку "is a directory"
    Then ассистент вызывает:
      | step | tool       | args |
      | 2 | list_files | { "path": "src" } |
    And отвечает с краткой сводкой содержимого
