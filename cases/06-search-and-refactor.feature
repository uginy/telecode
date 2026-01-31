@golden @priority-high
Feature: Поиск и рефакторинг по запросу

  Background:
    Given workspace открыт в VS Code
    And сессия пустая (нет ранее собранного контекста)
    And настройки:
      | key | value |
      | autoApprove | true |
      | contextUseSearch | true |

  Scenario: Пользователь просит переименовать функцию в проекте
    Given в проекте есть функция "detectToolCalls" (устаревшая)
    When пользователь пишет "переименуй detectToolCalls в parseToolCalls везде"
    Then статусы включают:
      | status |
      | searching_codebase |
      | running_tools |
    And tool calls в порядке:
      | step | tool         | args |
      | 1 | search_files | { "query": "detectToolCalls" } |
      | 2 | replace_in_file | { "path": "<matched-file>", "content": "<patch>" } |
    And approvals:
      | tool | expected |
      | search_files | allowed |
      | replace_in_file | auto-approved |
    And ассистент отвечает:
      | rule | expected |
      | language | same as user |
      | summary | includes number of replacements |
