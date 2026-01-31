@golden @priority-high
Feature: Генерация тестов

  Background:
    Given workspace открыт в VS Code
    And сессия пустая (нет ранее собранного контекста)
    And настройки:
      | key | value |
      | autoApprove | true |

  Scenario: Пользователь просит тесты для модуля
    Given в проекте есть файл "src/core/tools/toolParsing.ts"
    When пользователь пишет "/test добавь тесты для toolParsing"
    Then статусы включают:
      | status |
      | building_context |
      | running_tools |
    And tool calls в порядке:
      | step | tool       | args |
      | 1 | read_file | { "path": "src/core/tools/toolParsing.ts" } |
      | 2 | write_file | { "path": "tests/toolParsing.test.ts", "content": "<tests>" } |
    And approvals:
      | tool | expected |
      | read_file | allowed |
      | write_file | auto-approved |
    And ассистент отвечает:
      | rule | expected |
      | language | same as user |
      | summary | 1 sentence |
