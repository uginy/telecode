Feature: Автоаппрув инструментов

  Scenario: Автоаппрув включен, правка применяется без подтверждения
    Given настройка "autoApprove" включена
    When пользователь просит "исправь опечатку в README.md"
    Then плагин сразу вызывает:
      | tool            | args                            |
      | replace_in_file | { "path": "README.md", "content": "<patch>" } |
    And не показывает карточку подтверждения правки
