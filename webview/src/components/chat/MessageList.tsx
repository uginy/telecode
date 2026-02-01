import type React from 'react';
import { useRef, useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { MessageItem } from './MessageItem';
import { ThinkingBubble } from './ThinkingBubble';
import { ToolTimeline } from './ToolTimeline';
import { useChatStore } from '@/store/useChatStore';

export const MessageList: React.FC = () => {
  const messages = useChatStore((state) => state.messages);
  const isStreaming = useChatStore((state) => state.isStreaming);
  const assistantStatus = useChatStore((state) => state.assistantStatus);
  const statusLocale = useChatStore((state) => state.statusLocale);
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPinnedToBottom, setIsPinnedToBottom] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const threshold = 80;
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      setIsPinnedToBottom(distanceFromBottom < threshold);
    };

    handleScroll();
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!isPinnedToBottom) return;
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: isStreaming ? 'auto' : 'smooth' });
    }
  }, [messages, isStreaming, isPinnedToBottom]);

  const lastAssistantId = [...messages].reverse().find((m) => m.role === 'assistant')?.id;
  const statusText = assistantStatus
    ? {
        en: {
          thinking: 'Thinking…',
          analyzing: 'Analyzing request…',
          building_context: 'Building context…',
          searching_codebase: 'Searching codebase…',
          running_tools: 'Running tools…',
        },
        ru: {
          thinking: 'Думаю…',
          analyzing: 'Анализирую запрос…',
          building_context: 'Собираю контекст…',
          searching_codebase: 'Ищу по кодовой базе…',
          running_tools: 'Запускаю инструменты…',
        },
        zh: {
          thinking: '正在思考…',
          analyzing: '正在分析请求…',
          building_context: '正在构建上下文…',
          searching_codebase: '正在搜索代码库…',
          running_tools: '正在运行工具…',
        },
        ja: {
          thinking: '思考中…',
          analyzing: 'リクエストを分析中…',
          building_context: 'コンテキストを準備中…',
          searching_codebase: 'コードベースを検索中…',
          running_tools: 'ツールを実行中…',
        },
        ko: {
          thinking: '생각 중…',
          analyzing: '요청 분석 중…',
          building_context: '컨텍스트 구성 중…',
          searching_codebase: '코드베이스 검색 중…',
          running_tools: '도구 실행 중…',
        },
      }[statusLocale]?.[assistantStatus.key] ??
      {
        thinking: 'Thinking…',
        analyzing: 'Analyzing request…',
        building_context: 'Building context…',
        searching_codebase: 'Searching codebase…',
        running_tools: 'Running tools…',
      }[assistantStatus.key]
    : null;

  const showThinking =
    (isStreaming || !!assistantStatus) &&
    messages.length > 0 &&
    messages[messages.length - 1].role === 'user';

  if (messages.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="flex flex-col items-center justify-center text-center p-10 space-y-5 min-h-[320px]">
          <div className="h-14 w-14 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-primary/80" />
          </div>
          <div className="space-y-2 max-w-[260px]">
            <h2 className="text-base font-semibold text-foreground/90 tracking-tight">Where do we start?</h2>
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              Ask for a project overview, describe a bug, or drop files to build context fast.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto min-h-0" data-testid="message-list">
      <div className="flex flex-col gap-3 py-4 px-2 max-w-[920px] w-full mx-auto">
        <ToolTimeline />
        {messages.map((msg) => (
          <MessageItem
            key={msg.id}
            message={msg}
            statusText={msg.id === lastAssistantId ? statusText ?? undefined : undefined}
          />
        ))}
        {showThinking && <ThinkingBubble status={statusText ?? undefined} />}
        <div ref={scrollRef} className="h-6" />
      </div>
    </div>
  );
};
