import { describe, expect, test } from "bun:test";
import { parseToolCalls } from "../src/core/tools/toolParsing";

const getArgs = (call: ReturnType<typeof parseToolCalls>[number]) =>
  JSON.parse(call.arguments) as Record<string, unknown>;

describe("parseToolCalls", () => {
  test("reads path from inner content", () => {
    const calls = parseToolCalls("<read_file>README.md</read_file>");
    expect(calls).toHaveLength(1);
    expect(getArgs(calls[0]).path).toBe("README.md");
  });

  test("reads path from attribute for read_file", () => {
    const calls = parseToolCalls('<read_file path="src/index.ts"></read_file>');
    expect(calls).toHaveLength(1);
    expect(getArgs(calls[0]).path).toBe("src/index.ts");
  });

  test("defaults list_files path to root when empty", () => {
    const calls = parseToolCalls("<list_files/>");
    expect(calls).toHaveLength(1);
    expect(getArgs(calls[0]).path).toBe(".");
  });

  test("uses attribute path for list_files", () => {
    const calls = parseToolCalls('<list_files path="src"></list_files>');
    expect(calls).toHaveLength(1);
    expect(getArgs(calls[0]).path).toBe("src");
  });

  test("parses codebase_search JSON with null path", () => {
    const calls = parseToolCalls(
      '<codebase_search>{"query":"foo","path":null}</codebase_search>'
    );
    expect(calls).toHaveLength(1);
    const args = getArgs(calls[0]);
    expect(args.query).toBe("foo");
    expect(args.path).toBeNull();
  });

  test("falls back to inner content for codebase_search invalid JSON", () => {
    const calls = parseToolCalls("<codebase_search>{nope</codebase_search>");
    expect(calls).toHaveLength(1);
    const args = getArgs(calls[0]);
    expect(args.query).toBe("{nope");
  });

  test("parses run_command content", () => {
    const calls = parseToolCalls("<run_command>ls -la</run_command>");
    expect(calls).toHaveLength(1);
    expect(getArgs(calls[0]).command).toBe("ls -la");
  });

  test("parses search_files content", () => {
    const calls = parseToolCalls("<search_files>TODO</search_files>");
    expect(calls).toHaveLength(1);
    expect(getArgs(calls[0]).query).toBe("TODO");
  });

  test("parses write_file content", () => {
    const calls = parseToolCalls("<write_file>hello</write_file>");
    expect(calls).toHaveLength(1);
    expect(getArgs(calls[0]).content).toBe("hello");
  });

  test("parses replace_in_file content", () => {
    const calls = parseToolCalls("<replace_in_file>patch</replace_in_file>");
    expect(calls).toHaveLength(1);
    expect(getArgs(calls[0]).content).toBe("patch");
  });

  test("supports get_problems without path", () => {
    const calls = parseToolCalls("<get_problems />");
    expect(calls).toHaveLength(1);
    const args = getArgs(calls[0]);
    expect(Object.keys(args)).toHaveLength(0);
  });
});
