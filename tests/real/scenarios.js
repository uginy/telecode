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
  }
};
