import * as vscode from 'vscode';
import { Bot, Context } from 'grammy';
import { CodingAgent, createAgent, AISCodeConfig } from '../agent/codingAgent';
import { AgentTool, AgentEvent } from '@mariozechner/pi-agent-core';

export class TelegramChannel {
  private bot: Bot | null = null;
  private agent: CodingAgent | null = null;
  private isProcessing: boolean = false;
  private tools: AgentTool<any>[];

  constructor(tools: AgentTool<any>[]) {
    this.tools = tools;
  }

  public async start() {
    this.stop();

    const config = vscode.workspace.getConfiguration('aisCode');
    const enabled = config.get<boolean>('telegram.enabled');
    const token = config.get<string>('telegram.botToken');
    const allowedChatIdStr = config.get<string>('telegram.chatId');

    if (!enabled || !token) {
      return;
    }

    try {
      this.bot = new Bot(token);
      
      const allowedChatId = allowedChatIdStr ? Number.parseInt(allowedChatIdStr, 10) : null;

      // Auth middleware
      this.bot.use(async (ctx, next) => {
        if (allowedChatId && ctx.chat?.id !== allowedChatId) {
          console.warn(`Unauthorized access attempt from chat ID: ${ctx.chat?.id}`);
          return;
        }
        await next();
      });

      this.bot.command('start', async (ctx) => {
        await ctx.reply('🚀 AIS Code Agent is ready. Send me a task to begin!');
      });

      this.bot.command('stop', async (ctx) => {
        this.agent = null;
        this.isProcessing = false;
        await ctx.reply('🛑 Agent stopped.');
      });

      this.bot.on('message:text', async (ctx) => {
        await this.handleMessage(ctx);
      });

      this.bot.catch((err) => {
        console.error('Telegram bot error:', err);
      });

      await this.bot.start({
        onStart: (botInfo) => {
          console.log(`Telegram bot activated as @${botInfo.username}`);
          vscode.window.showInformationMessage(`AIS Code: Telegram bot started (@${botInfo.username})`);
        }
      });
    } catch (e: any) {
      vscode.window.showErrorMessage(`Failed to start Telegram bot: ${e.message}`);
      console.error(e);
    }
  }

  public stop() {
    if (this.bot) {
      this.bot.stop();
      this.bot = null;
      console.log('Telegram bot stopped.');
    }
  }

  private async handleMessage(ctx: Context) {
    if (this.isProcessing) {
      await ctx.reply('⏳ I am currently busy with another task. Please wait or send /stop to cancel it.');
      return;
    }

    const text = ctx.message?.text;
    if (!text) return;

    this.isProcessing = true;
    let replyMsg = await ctx.reply('Thinking...', { parse_mode: 'Markdown' });

    try {
      if (!this.agent) {
        this.agent = this.createCodingAgent();
        if (!this.agent) {
          if (ctx.chat?.id) {
            await ctx.api.editMessageText(ctx.chat.id, replyMsg.message_id, '❌ Missing API key or configuration for Agent.');
          }
          this.isProcessing = false;
          return;
        }
      }

      let currentReplyText = 'Running task...';
      let lastEditTime = Date.now();

      const updateReply = async (newText: string) => {
        const now = Date.now();
        // Avoid hitting Telegram rate limits (approx 1 edit per sec max)
        if (now - lastEditTime > 1500) {
          try {
            if (ctx.chat?.id) {
              await ctx.api.editMessageText(ctx.chat.id, replyMsg.message_id, newText, { parse_mode: 'Markdown' });
            }
            lastEditTime = now;
          } catch (e) {
            // ignore edit errors
          }
        }
        currentReplyText = newText;
      };

      const unsub = this.agent.subscribe(async (event: AgentEvent) => {
         if (event.type === 'tool_execution_update' || event.type === 'tool_execution_end') {
           const ev = event as any;
           await updateReply(`🔧 Executing: \`${ev.toolName}\``);
         } else if (event.type === 'message_update') {
           const ev = event as any;
           if (ev.assistantMessageEvent?.type === 'text_delta') {
             // For simplicity, we don't stream every single token to telegram, only status updates.
             // Telegram doesn't handle rapid streaming well.
           }
         }
      });

      await this.agent.prompt(text);
      
      const messages = this.agent.getAgent().state.messages;
      const lastMessage = messages[messages.length - 1];
      
      let finalResponse = 'Done.';
      if (lastMessage && lastMessage.role === 'assistant' && (lastMessage as any).content) {
         const content = (lastMessage as any).content;
         if (Array.isArray(content)) {
           finalResponse = content.filter(c => c.type === 'text').map(c => c.text).join('\n') || 'Done.';
         } else if (typeof content === 'string') {
           finalResponse = content;
         }
      }

      // Final update
      try {
         if (ctx.chat?.id) {
           await ctx.api.editMessageText(ctx.chat.id, replyMsg.message_id, finalResponse.substring(0, 4000));
         }
      } catch (e) {
         await ctx.reply(finalResponse.substring(0, 4000));
      }
      
      unsub();
    } catch (e: any) {
       console.error(e);
       await ctx.reply(`❌ Agent crashed: ${e.message}`);
    } finally {
       this.isProcessing = false;
    }
  }

  private createCodingAgent(): CodingAgent | null {
    const config = vscode.workspace.getConfiguration('aisCode');
    
    const apiKey = config.get<string>('apiKey');
    const provider = config.get<string>('provider') || 'openrouter';
    const model = config.get<string>('model') || 'google/gemini-2.0-flash-exp:free';
    
    if (!apiKey) {
      vscode.window.showErrorMessage('AIS Code: Cannot start Telegram Agent - API Key is missing in settings.');
      return null;
    }

    const agentConfig: AISCodeConfig = {
      provider,
      model,
      apiKey
    };

    return createAgent(agentConfig, this.tools);
  }
}
