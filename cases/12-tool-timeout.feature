@golden @priority-high
Feature: Таймаут инструментов

  Background:
    Given workspace открыт в VS Code
    And сессия пустая (нет ранее собранного контекста)
    And настройки:
      | key | value |
      | toolTimeoutMs | 20000 |

  Scenario: Tool result не пришел вовремя
    Given ассистент вызвал tool "run_command"
    And tool result не приходит за 20 секунд
    Then статусы включают:
      | status |
      | running_tools |
    And tool calls в порядке:
      | step | tool        | args |
      | 1 | run_command | { "command": "<any>" } |
    And approvals:
      | tool | expected |
      | run_command | allowed |
    And ассистент отвечает:
      | rule | expected |
      | summary | tool timeout message |
