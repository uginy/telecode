Feature: Объяснение файла

  Scenario: Пользователь просит объяснить файл
    Given открыт файл "src/core/context/SemanticIndex.ts"
    When пользователь пишет "/explain как работает этот индекс"
    Then плагин читает файл:
      | tool      | args                                    |
      | read_file | { "path": "src/core/context/SemanticIndex.ts" } |
    And ассистент отвечает в том же языке, кратко и по структуре файла
