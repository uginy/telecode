@golden @priority-high
Feature: Отказ в разрешении на tool

  Background:
    Given workspace открыт в VS Code
    And сессия пустая (нет ранее собранного контекста)
    And настройки:
      | key | value |
      | autoApprove | false |

  Scenario: Пользователь отказывает в запуске команды
    When пользователь пишет "запусти unit тесты"
    Then tool calls в порядке:
      | step | tool        | args |
      | 1 | run_command | { "command": "npm test" } |
    And approvals:
      | tool | expected |
      | run_command | requires approval |
    When пользователь отклоняет approval
    Then tool не выполняется
    And ассистент отвечает:
      | rule | expected |
      | summary | explains command was not run and предлагает альтернативу |
