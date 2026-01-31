
export interface MessagePart {
  role: string;
  content: string;
}

export const generateSessionSummaryPrompt = (messages: MessagePart[]): string => {
  const conversationText = messages
    .map(m => `${m.role}: ${m.content.substring(0, 200)}`)
    .join('\n');

  return `
Analyze the conversation below and generate a concise title (3-5 words) in Russian that summarizes the main topic.
Output ONLY the title text. Do not use quotes.

Conversation:
${conversationText}
  `.trim();
};
