@golden @priority-high
Feature: Контекст без открытых вкладок

  Background:
    Given workspace открыт в VS Code
    And сессия пустая (нет ранее собранного контекста)
    And открытых вкладок нет
    And настройки:
      | key | value |
      | contextUseOpenTabs | true |

  Scenario: Пользователь задает вопрос без открытых файлов
    When пользователь пишет "где точка входа приложения?"
    Then статусы включают:
      | status |
      | building_context |
    And tool calls в порядке:
      | step | tool       | args |
      | 1 | list_files | { "path": "." } |
      | 2 | read_file | { "path": "package.json" } |
    And approvals:
      | tool | expected |
      | list_files | allowed |
      | read_file | allowed |
    And ассистент отвечает:
      | rule | expected |
      | language | same as user |
      | summary | points to entry file and suggests opening it |
