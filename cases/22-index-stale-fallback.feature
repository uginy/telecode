@golden @priority-high
Feature: Устаревший индекс и fallback

  Background:
    Given workspace открыт в VS Code
    And сессия пустая (нет ранее собранного контекста)
    And настройки:
      | key | value |
      | workspaceIndex | true |

  Scenario: Индекс устарел и требует перестроения
    Given индекс был построен более 5 минут назад
    When пользователь пишет "где у нас обработка intent?"
    Then плагин сначала пытается:
      | step | tool            | args |
      | 1 | codebase_search | { "query": "intent", "path": null } |
    And если индекс еще не готов, делает fallback:
      | step | tool         | args |
      | 2 | search_files | { "query": "intent" } |
    And ассистент отвечает с указанием найденных файлов
