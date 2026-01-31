@edge @priority-high
Feature: Ошибки нескольких tools в одном ответе

  Background:
    Given workspace открыт в VS Code
    And сессия пустая (нет ранее собранного контекста)
    And настройки:
      | key | value |
      | autoApprove | true |

  Scenario: Один tool падает, другой успешен
    When пользователь пишет "покажи структуру и README"
    Then tool calls в порядке:
      | step | tool      | args |
      | 1 | list_files | { "path": "." } |
      | 2 | read_file | { "path": "README.md" } |
    And если read_file возвращает ошибку "not found"
    Then ассистент сообщает о частичном результате
    And предлагает fallback (list_files и повторный read)
