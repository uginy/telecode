@real @golden @priority-medium @id:real-summary-readme
Feature: Real LLM - краткое описание README

  Background:
    Given workspace открыт в VS Code
    And сессия пустая (нет ранее собранного контекста)

  Scenario: Кратко описать проект по README
    When пользователь пишет "О чем этот проект?"
    Then tool calls в порядке:
      | step | tool      | args |
      | 1 | read_file | { "path": "README.md" } |
    And ассистент отвечает в одном предложении
