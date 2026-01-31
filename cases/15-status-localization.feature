@golden @priority-medium
Feature: Локализация статусов

  Background:
    Given workspace открыт в VS Code
    And сессия пустая (нет ранее собранного контекста)

  Scenario: Пользователь пишет на русском
    When пользователь пишет "проверь код"
    Then статусы включают:
      | status |
      | thinking |
    And UI отображает статус на русском (например "Думаю…")

  Scenario: Пользователь пишет на английском
    When пользователь пишет "check the code"
    Then статусы включают:
      | status |
      | thinking |
    And UI отображает статус на английском (например "Thinking…")
