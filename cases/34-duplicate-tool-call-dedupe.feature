@edge @priority-low
Feature: Дублирующий tool call

  Background:
    Given workspace открыт в VS Code
    And сессия пустая (нет ранее собранного контекста)

  Scenario: Один и тот же tool указан дважды
    When ассистент возвращает:
      """
      <list_files path="."/>
      <list_files path="."></list_files>
      """
    Then выполняется только один tool call
    And tool timeline содержит 1 запись
