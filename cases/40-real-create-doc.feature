@real @golden @priority-high @id:real-create-doc
Feature: Real LLM - создание документа

  Background:
    Given workspace открыт в VS Code
    And сессия пустая (нет ранее собранного контекста)

  Scenario: Создать файл с точным содержимым
    When пользователь пишет "Создай файл REAL_TEST_DOC.md в корне проекта"
    Then tool calls в порядке:
      | step | tool       | args |
      | 1 | write_file | { "path": "REAL_TEST_DOC.md", "content": "<generated>" } |
    And ассистент пишет краткий отчет
