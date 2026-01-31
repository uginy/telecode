@golden @priority-high
Feature: Запуск команды в терминале

  Background:
    Given workspace открыт в VS Code
    And сессия пустая (нет ранее собранного контекста)
    And настройки:
      | key | value |
      | autoApprove | false |

  Scenario: Пользователь просит запустить lint
    When пользователь пишет "запусти lint"
    Then статусы включают:
      | status |
      | running_tools |
    And tool calls в порядке:
      | step | tool        | args |
      | 1 | run_command | { "command": "npm run lint" } |
    And approvals:
      | tool | expected |
      | run_command | requires approval |
    And ассистент отвечает:
      | rule | expected |
      | language | same as user |
      | summary | includes command result |
