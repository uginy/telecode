@real @golden @priority-medium @id:real-summary-readme
Feature: Real LLM - краткое описание README

  Background:
    Given workspace открыт в VS Code
    And сессия пустая (нет ранее собранного контекста)

  Scenario: Кратко описать проект по README
    When пользователь пишет "О чем этот проект?"
    Then ассистент отвечает в одном предложении
    And если README не в контексте, он читает README.md через tool
