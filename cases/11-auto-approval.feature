@golden @priority-high
Feature: Автоаппрув инструментов

  Background:
    Given workspace открыт в VS Code
    And сессия пустая (нет ранее собранного контекста)
    And настройки:
      | key | value |
      | autoApprove | true |

  Scenario: Автоаппрув включен, правка применяется без подтверждения
    When пользователь просит "исправь опечатку в README.md"
    Then статусы включают:
      | status |
      | running_tools |
    And tool calls в порядке:
      | step | tool            | args |
      | 1 | replace_in_file | { "path": "README.md", "content": "<patch>" } |
    And approvals:
      | tool | expected |
      | replace_in_file | auto-approved |
    And ассистент отвечает:
      | rule | expected |
      | language | same as user |
      | summary | 1 sentence |
