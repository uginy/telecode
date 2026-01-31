@golden @priority-high
Feature: Контекст через @-вставки

  Background:
    Given workspace открыт в VS Code
    And сессия пустая (нет ранее собранного контекста)
    And открыты вкладки: "src/extension.ts"
    And настройки:
      | key | value |
      | contextUseOpenTabs | true |
      | contextUseSearch | true |

  Scenario: Пользователь явно указывает контекст через @
    Given пользователь добавил контекст "@src/core/tools/toolParsing.ts"
    When пользователь пишет "объясни этот файл"
    Then плагин использует только явный контекст (без широкого поиска)
    And tool calls в порядке:
      | step | tool      | args |
      | 1 | read_file | { "path": "src/core/tools/toolParsing.ts" } |
    And approvals:
      | tool | expected |
      | read_file | allowed |
    And ассистент отвечает:
      | rule | expected |
      | language | same as user |
      | summary | concise explanation |
