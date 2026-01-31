Feature: Таймаут инструментов

  Scenario: Tool result не пришел вовремя
    Given ассистент вызвал tool "run_command"
    And tool result не приходит за 20 секунд
    Then в tool timeline статус помечается как "timeout"
    And ассистент сообщает об ошибке и предлагает повторить
