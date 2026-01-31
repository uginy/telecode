@golden @priority-high
Feature: Отмена генерации

  Background:
    Given workspace открыт в VS Code
    And сессия пустая (нет ранее собранного контекста)

  Scenario: Пользователь нажимает Stop во время стриминга
    Given ассистент стримит ответ
    When пользователь нажимает Stop
    Then стриминг останавливается
    And статусы сбрасываются
    And новые tool calls не запускаются
