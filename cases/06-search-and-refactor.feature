Feature: Поиск и рефакторинг по запросу

  Scenario: Пользователь просит переименовать функцию в проекте
    Given в проекте есть функция "detectToolCalls" (устаревшая)
    When пользователь пишет "переименуй detectToolCalls в parseToolCalls везде"
    Then плагин сначала ищет все упоминания:
      | tool         | args                          |
      | search_files | { "query": "detectToolCalls" } |
    And затем применяет изменения:
      | tool            | args                                 |
      | replace_in_file | { "path": "<matched-file>", "content": "<patch>" } |
    And ассистент пишет краткий отчет о количестве замен
