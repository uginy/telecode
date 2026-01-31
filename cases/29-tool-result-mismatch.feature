@edge @priority-high
Feature: Несоответствие tool result

  Background:
    Given workspace открыт в VS Code
    And сессия пустая (нет ранее собранного контекста)

  Scenario: tool result приходит для неизвестного toolCallId
    When ассистент получил toolResult с toolCallId "unknown"
    Then tool timeline не падает
    And ассистент сообщает о несовпадении результата
    And предлагает повторить действие
