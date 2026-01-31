@golden @priority-high
Feature: Разрешение tool один раз

  Background:
    Given workspace открыт в VS Code
    And сессия пустая (нет ранее собранного контекста)
    And настройки:
      | key | value |
      | autoApprove | false |

  Scenario: Пользователь разрешает write_file один раз
    When пользователь пишет "сохрани список задач в TODO.md"
    Then tool calls в порядке:
      | step | tool       | args |
      | 1 | write_file | { "path": "TODO.md", "content": "<generated>" } |
    And approvals:
      | tool | expected |
      | write_file | requires approval |
    When пользователь выбирает "allow once"
    Then файл создается
    And при следующей просьбе "обнови TODO.md" снова требуется approval
