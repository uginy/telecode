@golden @priority-high
Feature: Архитектурный анализ проекта

  Background:
    Given workspace открыт в VS Code
    And сессия пустая (нет ранее собранного контекста)
    And открыты вкладки: "src/extension.ts", "src/panels/ChatViewProvider.ts"
    And настройки:
      | key | value |
      | contextUseOpenTabs | true |
      | contextUseSemantic | true |
      | contextUseSearch | true |

  Scenario: Пользователь просит архитектурные особенности проекта
    When пользователь пишет "проанализируй проект и скажи его архитектурные особенности"
    Then статусы включают:
      | status |
      | building_context |
      | searching_codebase |
    And tool calls в порядке:
      | step | tool            | args |
      | 1 | list_files | { "path": "." } |
      | 2 | read_file | { "path": "package.json" } |
      | 3 | read_file | { "path": "README.md" } |
      | 4 | codebase_search | { "query": "architecture", "path": null } |
      | 5 | codebase_search | { "query": "context", "path": null } |
    And approvals:
      | tool | expected |
      | list_files | allowed |
      | read_file | allowed |
      | codebase_search | allowed |
    And ассистент отвечает:
      | rule | expected |
      | language | same as user |
      | summary | 1 sentence |
      | details | architecture layers + data flow + key modules |
