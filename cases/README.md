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

## Теги и фильтрация

Мы используем теги:
- `@golden` - базовые сценарии качества
- `@edge` - edge/regression сценарии
- `@aaa` - тяжелые стресс-тесты (очень большие файлы / сложные рефакторинги)
- `@priority-high|@priority-medium|@priority-low` - приоритет

Фильтрация генерации:

```
npm run gherkin:flows -- --tags=@golden,@priority-high
npm run gherkin:flows -- --exclude=@edge
```

Можно также указать путь вывода:

```
npm run gherkin:flows -- --tags=@edge --out=cases/golden/edge.json
```

## Rate limiting для реальных LLM прогонов

Если хотите прогонять через реальные запросы к провайдеру, используйте флаг:

```
npm run smoke:flows -- --real-llm --tags=@real --workspace=tests/fixtures/real-project --delay=2500 --batch=5 --batch-delay=8000
```

Это добавит паузы между сценариями и защитит от rate limits.

AAA-прогоны лучше запускать отдельно:

```
npm run smoke:flows -- --real-llm --tags=@aaa --delay=5000 --batch=1 --batch-delay=15000
```

После AAA-прогона результаты сохраняются в `tests/results/aaa/<model>/<timestamp>/`.
Сгенерированные файлы в `tests/fixtures/mega-landing/` очищаются автоматически.

E2E проверка отрисовки AAA:

```
npm run e2e:aaa
```

## LLM для реальных тестов

Для реальных тестов используем текущий провайдер и модель, сохраненные в настройках проекта.
Не коммитим API-ключи. Модель выбираем в Settings на рабочей машине.
Подробнее: `docs/testing/LLM.md`.

Рекомендуемая модель для регресса (OpenRouter):

```
z-ai/glm-4.5-air:free
```

Альтернативы, если нужно сравнение качества:

```
arcee-ai/trinity-large-preview:free
tngtech/deepseek-r1t2-chimera:free
```
