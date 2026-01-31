Feature: Генерация тестов

  Scenario: Пользователь просит тесты для модуля
    Given в проекте есть файл "src/core/tools/toolParsing.ts"
    When пользователь пишет "/test добавь тесты для toolParsing"
    Then плагин читает файл:
      | tool      | args                                    |
      | read_file | { "path": "src/core/tools/toolParsing.ts" } |
    And ассистент создает тестовый файл:
      | tool       | args                                              |
      | write_file | { "path": "tests/toolParsing.test.ts", "content": "<tests>" } |
    And в чате пишет краткий отчет о добавленных тестах
