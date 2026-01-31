Feature: Запуск команды в терминале

  Scenario: Пользователь просит запустить lint
    Given проект открыт в VS Code
    When пользователь пишет "запусти lint"
    Then плагин вызывает:
      | tool        | args                            |
      | run_command | { "command": "npm run lint" }  |
    And в итоге сообщает результат и предлагает следующий шаг
