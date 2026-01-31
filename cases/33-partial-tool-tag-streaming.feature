@edge @priority-medium
Feature: Частичный tool tag во время стриминга

  Background:
    Given workspace открыт в VS Code
    And сессия пустая (нет ранее собранного контекста)

  Scenario: Tool tag приходит частями
    Given ассистент стримит "<read_file path=\"README.md\">"
    When стриминг продолжается и тег закрывается
    Then tool call запускается только после полного тега
    And UI не показывает ошибку парсинга
