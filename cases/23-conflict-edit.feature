@golden @priority-high
Feature: Конфликт при replace_in_file

  Background:
    Given workspace открыт в VS Code
    And сессия пустая (нет ранее собранного контекста)
    And настройки:
      | key | value |
      | autoApprove | true |

  Scenario: replace_in_file не находит матч
    When пользователь пишет "переименуй переменную oldName в newName в src/app.ts"
    Then tool calls в порядке:
      | step | tool            | args |
      | 1 | read_file | { "path": "src/app.ts" } |
      | 2 | replace_in_file | { "path": "src/app.ts", "content": "<patch>" } |
    And если replace_in_file возвращает "no match"
    Then ассистент читает актуальный файл снова
    And пробует заменить еще раз с обновленным контекстом
