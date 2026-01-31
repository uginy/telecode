@golden @priority-medium
Feature: Настройки intent routing

  Background:
    Given workspace открыт в VS Code
    And сессия пустая (нет ранее собранного контекста)
    And настройки:
      | key | value |
      | intentRoutingEnabled | false |

  Scenario: Intent routing отключен
    When пользователь пишет "кратко опиши проект"
    Then статусы включают:
      | status |
      | thinking |
    And статус "analyzing" не появляется
    And ассистент отвечает напрямую, без отдельного шага intent routing
