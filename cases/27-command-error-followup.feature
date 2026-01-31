@golden @priority-high
Feature: Ошибка команды и follow-up

  Background:
    Given workspace открыт в VS Code
    And сессия пустая (нет ранее собранного контекста)
    And настройки:
      | key | value |
      | autoApprove | true |

  Scenario: Линт падает, требуется диагностика
    When пользователь пишет "запусти lint и исправь ошибки"
    Then tool calls в порядке:
      | step | tool        | args |
      | 1 | run_command | { "command": "npm run lint" } |
    And если команда вернула ошибки
    Then ассистент открывает релевантный файл:
      | step | tool      | args |
      | 2 | read_file | { "path": "<error-file>" } |
    And предлагает исправление через replace_in_file
