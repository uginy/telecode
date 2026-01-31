import { getEncoding } from "js-tiktoken";
import type { Message, AgentContext } from "../types";

export class ContextManager {
  private messages: Message[] = [];
  private encoding = getEncoding("cl100k_base");
  private maxTokens: number;

  constructor(maxTokens = 200000) {
    this.maxTokens = maxTokens;
  }

  addMessage(message: Message) {
    this.messages.push(message);
    this.pruneIfNeeded();
  }

  setSystemMessage(message: Message) {
    // Remove any existing system messages
    this.messages = this.messages.filter(m => m.role !== 'system');
    // Prepend the new one
    this.messages.unshift(message);
    this.pruneIfNeeded();
  }

  getMessages(): Message[] {
    return this.messages;
  }

  setMessages(messages: Message[]) {
    this.messages = messages;
    this.pruneIfNeeded();
  }

  getUsage() {
    return {
      used: this.calculateTokens(),
      total: this.maxTokens
    };
  }

  getContext(): AgentContext {
    const usage = this.getUsage();
    return {
      messages: this.messages,
      totalTokens: usage.used,
      modelId: "experimental", // Placeholder
    };
  }

  private calculateTokens(): number {
    let tokens = 0;
    for (const msg of this.messages) {
      tokens += this.encoding.encode(msg.content).length;
      // Add overhead for role and other fields (simplified)
      tokens += 4; 
    }
    return tokens;
  }

  private pruneIfNeeded() {
    // Keep system message (usually at index 0)
    const systemMessage = this.messages.find(m => m.role === 'system');
    
    while (this.calculateTokens() > this.maxTokens && this.messages.length > 1) {
      // Find the first non-system message and remove it
      const indexToRemove = this.messages.findIndex(m => m.role !== 'system');
      if (indexToRemove !== -1) {
        this.messages.splice(indexToRemove, 1);
      } else {
        break; // Only system message left
      }
    }
    
    // Ensure system message is still there if it was removed (unlikely)
    if (systemMessage && !this.messages.includes(systemMessage)) {
      this.messages.unshift(systemMessage);
    }
  }

  clear() {
    this.messages = [];
  }
}
