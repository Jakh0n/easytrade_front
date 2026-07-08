import { type StreamHandlers, streamSSE } from "./client";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function streamChat(
  messages: ChatMessage[],
  context: string | undefined,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  return streamSSE("/api/chat", { messages, context }, handlers, signal);
}
