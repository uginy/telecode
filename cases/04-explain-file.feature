@golden @priority-medium
Feature: Объяснение файла

  Background:
    Given workspace открыт в VS Code
    And сессия пустая (нет ранее собранного контекста)
    And открыты вкладки: "src/core/context/SemanticIndex.ts"
    And настройки:
      | key | value |
      | contextUseOpenTabs | true |

  Scenario: Пользователь просит объяснить файл
    When пользователь пишет "/explain как работает этот индекс"
    Then статусы включают:
      | status |
      | building_context |
    And tool calls в порядке:
      | step | tool      | args |
      | 1 | read_file | { "path": "src/core/context/SemanticIndex.ts" } |
    And approvals:
      | tool | expected |
      | read_file | allowed |
    And ассистент отвечает:
      | rule | expected |
      | language | same as user |
      | summary | concise explanation by file sections |
