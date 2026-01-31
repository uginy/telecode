@golden @priority-medium
Feature: Лимиты контекста

  Background:
    Given workspace открыт в VS Code
    And сессия пустая (нет ранее собранного контекста)
    And открыты вкладки: "a.ts", "b.ts", "c.ts", "d.ts", "e.ts", "f.ts", "g.ts", "h.ts", "i.ts"
    And настройки:
      | key | value |
      | contextMaxOpenTabs | 5 |
      | contextMaxSearchSnippets | 3 |

  Scenario: Контекст ограничен настройками
    When пользователь пишет "объясни как устроен проект"
    Then плагин включает в контекст только 5 вкладок
    And ограничивает количество сниппетов до 3
    And ассистент сообщает, что контекст был усечен
