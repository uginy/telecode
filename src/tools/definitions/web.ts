import { Type, type Static } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { trimOutput } from "../core/utils";

export const fetchUrlParams = Type.Object({
  url: Type.String({ description: "URL to fetch content from" }),
  maxChars: Type.Optional(
    Type.Integer({
      minimum: 500,
      maximum: 100_000,
      description: "Max characters to return (default: 20000)",
    }),
  ),
  raw: Type.Optional(
    Type.Boolean({
      description: "Return raw HTML instead of cleaned text (default: false)",
    }),
  ),
});

type FetchUrlParams = Static<typeof fetchUrlParams>;

const DEFAULT_MAX_CHARS = 20_000;
const FETCH_TIMEOUT_MS = 15_000;

const USER_AGENT = "Mozilla/5.0 (compatible; TeleCodeBot/1.0)";

/**
 * Lightweight HTML-to-text conversion without external dependencies.
 * Strips tags, decodes common entities, collapses whitespace, and preserves
 * basic structure (headings, paragraphs, list items, code blocks).
 */
function htmlToReadableText(html: string): string {
  let text = html;

  // Remove script, style, svg, and noscript blocks entirely
  text = text.replace(/<(script|style|svg|noscript)[^>]*>[\s\S]*?<\/\1>/gi, "");

  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, "");

  // Headings → markdown-style
  text = text.replace(
    /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi,
    (_match, level, content) => {
      const prefix = "#".repeat(Number(level));
      return `\n\n${prefix} ${stripTags(content).trim()}\n\n`;
    },
  );

  // <pre>/<code> blocks → fenced code
  text = text.replace(
    /<pre[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi,
    (_m, code) => {
      return `\n\`\`\`\n${decodeEntities(code).trim()}\n\`\`\`\n`;
    },
  );
  text = text.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_m, code) => {
    return `\n\`\`\`\n${decodeEntities(stripTags(code)).trim()}\n\`\`\`\n`;
  });

  // Inline code
  text = text.replace(
    /<code[^>]*>([\s\S]*?)<\/code>/gi,
    (_m, c) => `\`${stripTags(c).trim()}\``,
  );

  // Block elements → newlines
  text = text.replace(/<(br|hr)\s*\/?>/gi, "\n");
  text = text.replace(
    /<\/(p|div|section|article|blockquote|tr|li|dt|dd)>/gi,
    "\n",
  );
  text = text.replace(/<(p|div|section|article|blockquote)[^>]*>/gi, "\n");

  // List items
  text = text.replace(/<li[^>]*>/gi, "\n- ");

  // Links → [text](url)
  text = text.replace(
    /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_m, href, label) => {
      const cleanLabel = stripTags(label).trim();
      return cleanLabel ? `[${cleanLabel}](${href})` : href;
    },
  );

  // Bold / italic
  text = text.replace(
    /<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi,
    (_m, _t, c) => `**${stripTags(c).trim()}**`,
  );
  text = text.replace(
    /<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi,
    (_m, _t, c) => `*${stripTags(c).trim()}*`,
  );

  // Strip remaining tags
  text = stripTags(text);

  // Decode HTML entities
  text = decodeEntities(text);

  // Collapse whitespace: 3+ newlines → 2, trim lines
  text = text
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(Number(dec)));
}

export function createWebTools(): AgentTool[] {
  return [
    {
      name: "fetch_url",
      label: "Fetch",
      description:
        "Fetch a web page and return its content as readable text (HTML stripped). " +
        "Useful for reading documentation, READMEs, API references, blog posts, etc.",
      parameters: fetchUrlParams,
      execute: async (_toolCallId, params) => {
        const typed = params as FetchUrlParams;
        const maxChars = typed.maxChars ?? DEFAULT_MAX_CHARS;

        let url: URL;
        try {
          url = new URL(typed.url);
        } catch {
          throw new Error(`Invalid URL: ${typed.url}`);
        }

        if (!["http:", "https:"].includes(url.protocol)) {
          throw new Error(
            `Unsupported protocol: ${url.protocol}. Only http and https are allowed.`,
          );
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

        try {
          const response = await fetch(url.toString(), {
            headers: {
              "User-Agent": USER_AGENT,
              Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
              "Accept-Language": "en-US,en;q=0.9",
            },
            redirect: "follow",
            signal: controller.signal,
          });

          if (!response.ok) {
            throw new Error(
              `HTTP ${response.status} ${response.statusText} for ${url.toString()}`,
            );
          }

          const contentType = response.headers.get("content-type") || "";
          const body = await response.text();

          const isHtml =
            contentType.includes("html") || body.trimStart().startsWith("<");
          const content = typed.raw
            ? body
            : isHtml
              ? htmlToReadableText(body)
              : body;

          const trimmed = trimOutput(content, maxChars);

          return {
            content: [{ type: "text", text: trimmed }],
            details: {
              url: url.toString(),
              status: response.status,
              contentType,
              originalLength: body.length,
              returnedLength: trimmed.length,
            },
          };
        } catch (error) {
          if (
            error instanceof DOMException ||
            (error instanceof Error && error.name === "AbortError")
          ) {
            throw new Error(
              `Request timed out after ${FETCH_TIMEOUT_MS}ms for ${url.toString()}`,
            );
          }
          throw error;
        } finally {
          clearTimeout(timeout);
        }
      },
    },
  ];
}
