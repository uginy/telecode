# AIS Code - Use Case Catalogue (Cucumber Style)

Каждый `.feature` описывает типовой сценарий разработчика и ожидаемое поведение ассистента.
Цель - превратить эти сценарии в автоматизированные проверки.

## Единый шаблон

```
Feature: <Название>

  Background:
    Given workspace открыт в VS Code
    And сессия пустая (нет ранее собранного контекста)
    And открыты вкладки: "<file-a>", "<file-b>"
    And настройки:
      | key | value |
      | ... | ...   |

  Scenario: <Сценарий>
    When пользователь пишет "<text>"
    Then статусы включают:
      | status |
      | ...    |
    And tool calls в порядке:
      | step | tool | args |
      | 1    | ...  | ...  |
    And approvals:
      | tool | expected |
      | ...  | ...      |
    And ассистент отвечает:
      | rule | expected |
      | language | same as user |
      | summary  | 1 sentence |
      | file_output | no full content in chat |
```

## Принципы

- Всегда фиксируем контекст (open tabs, @-вставки, системные правила).
- Явно описываем порядок tool calls (важно для timeline и дебага).
- Отдельно фиксируем approvals (auto-approve on/off, allow once/session).
- Нормируем формат ожидаемого ответа (краткий отчет, язык, отсутствие полного файла в чате).

## Golden flows

Для автоматизации используется сборка "golden flows" из gherkin-файлов.
Скрипт парсит `.feature` и генерирует JSON с нормализованными шагами.

```
npm run gherkin:flows
```

Результат: `cases/golden/flows.json`
