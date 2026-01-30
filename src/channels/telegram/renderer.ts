import MarkdownIt from 'markdown-it';
import { TELEGRAM_TEXT_LIMIT, splitPlainText } from './utils';

const TELEGRAM_MARKDOWN = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false,
});

type MarkdownToken = ReturnType<typeof TELEGRAM_MARKDOWN.parse>[number];

type MarkdownRenderState = {
  listStack: Array<{ ordered: boolean; nextIndex: number }>;
  linkStack: boolean[];
};

export function markdownToTelegramHtmlChunks(markdownText: string, limit = TELEGRAM_TEXT_LIMIT): string[] {
  const normalized = markdownText.replace(/\r\n/g, '\n').trim();
  if (normalized.length === 0) {
    return [];
  }

  const chunks: string[] = [];
  const sections = normalized.split(/\n{2,}/).map((section) => section.trim()).filter((section) => section.length > 0);
  let current = '';

  const flushCurrent = (): void => {
    const value = current.trim();
    if (!value) {
      current = '';
      return;
    }

    const html = markdownToTelegramHtml(value);
    chunks.push(html);
    current = '';
  };

  for (const section of sections) {
    const candidate = current ? `${current}\n\n${section}` : section;
    const candidateHtml = markdownToTelegramHtml(candidate);

    if (candidateHtml.length <= limit) {
      current = candidate;
      continue;
    }

    if (current) {
      flushCurrent();
    }

    const sectionHtml = markdownToTelegramHtml(section);
    if (sectionHtml.length <= limit) {
      current = section;
      continue;
    }

    for (const plainChunk of splitPlainText(section, Math.max(800, limit - 200))) {
      const htmlChunk = markdownToTelegramHtml(plainChunk);
      chunks.push(htmlChunk);
    }
  }

  if (current) {
    flushCurrent();
  }

  if (chunks.length === 0) {
    const fallback = markdownToTelegramHtml(normalized);
    if (fallback.length <= limit) {
      return [fallback];
    }

    return splitPlainText(normalized, Math.max(800, limit - 200)).map((chunk) => markdownToTelegramHtml(chunk));
  }

  const boundedChunks: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length <= limit) {
      boundedChunks.push(chunk);
      continue;
    }

    const plain = chunk.replace(/<[^>]*>/g, '');
    for (const plainChunk of splitPlainText(plain, limit - 40)) {
      boundedChunks.push(escapeTelegramHtml(plainChunk));
    }
  }

  return boundedChunks;
}

export function markdownToTelegramHtml(markdownText: string): string {
  const tokens = TELEGRAM_MARKDOWN.parse(markdownText, {});
  const state: MarkdownRenderState = {
    listStack: [],
    linkStack: [],
  };

  const html = renderMarkdownTokens(tokens, state)
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return html.length > 0 ? html : 'Done.';
}

function renderMarkdownTokens(tokens: MarkdownToken[], state: MarkdownRenderState): string {
  let out = '';

  for (const token of tokens) {
    switch (token.type) {
      case 'inline':
        if (Array.isArray(token.children)) {
          out += renderMarkdownTokens(token.children as MarkdownToken[], state);
        }
        break;
      case 'text':
        out += escapeTelegramHtml(token.content || '');
        break;
      case 'softbreak':
      case 'hardbreak':
        out += '\n';
        break;
      case 'paragraph_open':
        break;
      case 'paragraph_close':
        out += '\n\n';
        break;
      case 'heading_open':
        out += '<b>';
        break;
      case 'heading_close':
        out += '</b>\n';
        break;
      case 'strong_open':
        out += '<b>';
        break;
      case 'strong_close':
        out += '</b>';
        break;
      case 'em_open':
        out += '<i>';
        break;
      case 'em_close':
        out += '</i>';
        break;
      case 's_open':
        out += '<s>';
        break;
      case 's_close':
        out += '</s>';
        break;
      case 'blockquote_open':
        out += '<blockquote>';
        break;
      case 'blockquote_close':
        out += '</blockquote>\n';
        break;
      case 'bullet_list_open':
        state.listStack.push({ ordered: false, nextIndex: 1 });
        break;
      case 'bullet_list_close':
        state.listStack.pop();
        out += '\n';
        break;
      case 'ordered_list_open': {
        const startValue = Number.parseInt(getTokenAttr(token, 'start') || '1', 10);
        const nextIndex = Number.isFinite(startValue) && startValue > 0 ? startValue : 1;
        state.listStack.push({ ordered: true, nextIndex });
        break;
      }
      case 'ordered_list_close':
        state.listStack.pop();
        out += '\n';
        break;
      case 'list_item_open': {
        const currentList = state.listStack[state.listStack.length - 1];
        const depth = Math.max(0, state.listStack.length - 1);
        const prefix = '  '.repeat(depth);
        if (currentList?.ordered) {
          out += `${prefix}${currentList.nextIndex}. `;
          currentList.nextIndex += 1;
        } else {
          out += `${prefix}- `;
        }
        break;
      }
      case 'list_item_close':
        out += '\n';
        break;
      case 'fence':
      case 'code_block': {
        const content = (token.content || '').replace(/\n+$/g, '');
        out += `<pre>${escapeTelegramHtml(content.length > 0 ? content : ' ')}</pre>\n`;
        break;
      }
      case 'code_inline':
        out += `<code>${escapeTelegramHtml(token.content || '')}</code>`;
        break;
      case 'link_open': {
        const href = getTokenAttr(token, 'href');
        if (href && isSupportedTelegramUrl(href)) {
          out += `<a href="${escapeTelegramHtmlAttribute(href)}">`;
          state.linkStack.push(true);
        } else {
          state.linkStack.push(false);
        }
        break;
      }
      case 'link_close': {
        const opened = state.linkStack.pop();
        if (opened) {
          out += '</a>';
        }
        break;
      }
      case 'hr':
        out += '--------\n';
        break;
      default:
        break;
    }
  }

  return out;
}

function getTokenAttr(token: MarkdownToken, name: string): string | null {
  if (typeof token.attrGet === 'function') {
    return token.attrGet(name);
  }

  if (!Array.isArray(token.attrs)) {
    return null;
  }

  for (const attr of token.attrs) {
    if (Array.isArray(attr) && attr[0] === name) {
      return typeof attr[1] === 'string' ? attr[1] : null;
    }
  }

  return null;
}

function isSupportedTelegramUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const protocol = parsed.protocol.toLowerCase();
    return protocol === 'http:' || protocol === 'https:' || protocol === 'tg:' || protocol === 'mailto:';
  } catch {
    return false;
  }
}

export function escapeTelegramHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeTelegramHtmlAttribute(value: string): string {
  return escapeTelegramHtml(value).replace(/"/g, '&quot;');
}
