@golden @priority-high
Feature: Семантический поиск как первичная стратегия

  Background:
    Given workspace открыт в VS Code
    And сессия пустая (нет ранее собранного контекста)
    And настройки:
      | key | value |
      | contextUseSemantic | true |
      | contextSemanticFirst | true |

  Scenario: Пользователь спрашивает про "intent routing"
    When пользователь пишет "где у нас intent routing?"
    Then статусы включают:
      | status |
      | searching_codebase |
    And tool calls в порядке:
      | step | tool            | args |
      | 1 | codebase_search | { "query": "intent routing", "path": null } |
      | 2 | read_file | { "path": "<top-result-file>" } |
    And approvals:
      | tool | expected |
      | codebase_search | allowed |
      | read_file | allowed |
    And ассистент отвечает:
      | rule | expected |
      | language | same as user |
      | summary | points to relevant files and sections |
