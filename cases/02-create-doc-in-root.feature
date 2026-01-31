@golden @priority-high
Feature: Создание документа в корне проекта

  Background:
    Given workspace открыт в VS Code
    And сессия пустая (нет ранее собранного контекста)
    And настройки:
      | key | value |
      | autoApprove | true |

  Scenario: Пользователь просит сохранить текст в документе
    Given пользователь отправил текст требований в чат
    When пользователь пишет "сохрани это в документе каком-то в корне"
    Then статусы включают:
      | status |
      | running_tools |
    And tool calls в порядке:
      | step | tool       | args |
      | 1 | write_file | { "path": "PRODUCT_IMPROVEMENT.md", "content": "<generated>" } |
    And approvals:
      | tool | expected |
      | write_file | auto-approved |
    And ассистент отвечает:
      | rule | expected |
      | language | same as user |
      | summary | 1 sentence |
      | file_output | no full content in chat |
