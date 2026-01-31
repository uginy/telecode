@golden @priority-high
Feature: Разрешение tool на всю сессию

  Background:
    Given workspace открыт в VS Code
    And сессия пустая (нет ранее собранного контекста)
    And настройки:
      | key | value |
      | autoApprove | false |

  Scenario: Пользователь разрешает run_command на всю сессию
    When пользователь пишет "запусти tests"
    Then tool calls в порядке:
      | step | tool        | args |
      | 1 | run_command | { "command": "npm test" } |
    And approvals:
      | tool | expected |
      | run_command | requires approval |
    When пользователь выбирает "allow session"
    Then команда выполняется
    And при следующем запросе "запусти tests еще раз" approval не требуется
