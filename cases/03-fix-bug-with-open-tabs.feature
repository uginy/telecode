@golden @priority-high
Feature: Исправление бага по открытым вкладкам

  Background:
    Given workspace открыт в VS Code
    And сессия пустая (нет ранее собранного контекста)
    And открыты вкладки: "src/core/agent/AgentOrbit.ts", "src/panels/chatView/sendMessage.ts"
    And настройки:
      | key | value |
      | autoApprove | true |
      | contextUseOpenTabs | true |

  Scenario: Пользователь просит исправить ошибку, не указывая файл
    When пользователь пишет "/fix падает при null path в codebase_search"
    Then статусы включают:
      | status |
      | building_context |
      | running_tools |
    And tool calls в порядке:
      | step | tool      | args |
      | 1 | read_file | { "path": "src/core/tools/toolParsing.ts" } |
      | 2 | replace_in_file | { "path": "src/core/tools/toolParsing.ts", "content": "<patch>" } |
    And approvals:
      | tool | expected |
      | read_file | allowed |
      | replace_in_file | auto-approved |
    And ассистент отвечает:
      | rule | expected |
      | language | same as user |
      | summary | 1 sentence |
