const path = require("path");

const workspace = () =>
  (process.env.FLOW_WORKSPACE || "").trim() || process.cwd();

const filePath = (relative) => path.join(workspace(), relative);

module.exports = {
  "real-create-doc": {
    text:
      "Создай файл REAL_TEST_DOC.md в корне проекта. " +
      "Содержимое строго:\n" +
      "# Test Doc\n" +
      "OK\n",
    expect: {
      toolCallsInclude: ["write_file"],
      files: [
        {
          path: "REAL_TEST_DOC.md",
          contains: ["# Test Doc", "OK"]
        }
      ]
    }
  },
  "real-fix-add": {
    text:
      "В файле src/math.ts функция add возвращает a - b. " +
      "Исправь на a + b.",
    expect: {
      toolCallsInclude: ["replace_in_file", "write_file"],
      files: [
        {
          path: "src/math.ts",
          contains: ["return a + b"]
        }
      ]
    }
  },
  "real-refactor-rename": {
    text:
      "В файле src/strings.ts замени ВСЕ вхождения badName на goodName. " +
      "Убедись, что badName больше не встречается.",
    expect: {
      toolCallsInclude: ["replace_in_file", "write_file"],
      files: [
        {
          path: "src/strings.ts",
          contains: ["goodName"],
          notContains: ["badName"]
        }
      ]
    }
  },
  "real-summary-readme": {
    text:
      "Прочитай README.md и в одном предложении скажи о чем проект.",
    expect: {
      responseContainsAny: ["fixture", "AIS Code", "test", "tests"]
    }
  },
  "real-aaa-mega-refactor": {
    text:
      "/fix В папке tests/fixtures/mega-landing есть legacy.html (~1500+ строк). " +
      "Сначала обязательно прочитай legacy.html через tool read_file. " +
      "Сделай глубокий рефакторинг: разнеси код на index.html, styles.css, app.js, " +
      "а также вынеси секции в отдельные файлы sections/hero.html, sections/features.html, " +
      "sections/pricing.html, sections/faq.html, sections/footer.html. " +
      "В index.html подключи styles.css и app.js, НЕ оставляй inline <style> или <script>. " +
      "Исправь баги: незакрытый div в FAQ и вызов startCarousel() без определения. " +
      "Сайт должен грузиться без ошибок. Не редактируй legacy.html, оставь его как исходник. " +
      "После чтения обязательно создай/обнови файлы через write_file/replace_in_file и закончи, " +
      "когда все файлы записаны.",
    contextItems: [
      { type: "file", value: "tests/fixtures/mega-landing/legacy.html" },
      { type: "folder", value: "tests/fixtures/mega-landing" }
    ],
    timeoutMs: 600000,
    expect: {
      toolCallsInclude: ["write_file", "replace_in_file"],
      files: [
        {
          path: "tests/fixtures/mega-landing/index.html",
          contains: [
            "styles.css",
            "app.js"
          ],
          notContains: ["<style>", "<script>"]
        },
        {
          path: "tests/fixtures/mega-landing/styles.css",
          contains: [".hero", ".cta-button", ".card"]
        },
        {
          path: "tests/fixtures/mega-landing/app.js",
          contains: ["addEventListener"]
        },
        {
          path: "tests/fixtures/mega-landing/sections/hero.html"
        },
        {
          path: "tests/fixtures/mega-landing/sections/features.html"
        },
        {
          path: "tests/fixtures/mega-landing/sections/pricing.html"
        },
        {
          path: "tests/fixtures/mega-landing/sections/faq.html"
        },
        {
          path: "tests/fixtures/mega-landing/sections/footer.html"
        }
      ]
    }
  }
};
