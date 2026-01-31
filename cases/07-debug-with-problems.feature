@golden @priority-high
Feature: Диагностика ошибок в проекте

  Background:
    Given workspace открыт в VS Code
    And сессия пустая (нет ранее собранного контекста)
    And настройки:
      | key | value |
      | autoApprove | false |

  Scenario: Пользователь просит найти ошибки компиляции
    When пользователь пишет "почему не собирается?"
    Then статусы включают:
      | status |
      | running_tools |
    And tool calls в порядке:
      | step | tool         | args |
      | 1 | get_problems | {} |
      | 2 | read_file | { "path": "<error-file>" } |
    And approvals:
      | tool | expected |
      | get_problems | allowed |
      | read_file | allowed |
      | replace_in_file | requires approval |
    And ассистент отвечает:
      | rule | expected |
      | language | same as user |
      | summary | identifies error cause |
