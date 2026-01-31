Feature: Семантический поиск как первичная стратегия

  Scenario: Пользователь спрашивает про "intent routing"
    Given включен контекст semantic search
    When пользователь пишет "где у нас intent routing?"
    Then плагин вызывает:
      | tool            | args                                      |
      | codebase_search | { "query": "intent routing", "path": null } |
    And при необходимости читает 1-2 файла из результатов
