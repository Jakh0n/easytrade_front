"use client";

import { Send, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { type AnalyzeResponse, type ChatMessage, streamChat } from "@/lib/api";
import { cn } from "@/lib/utils";

function buildContext(result: AnalyzeResponse): string {
  const { verdict, indicators, risk } = result;
  return [
    `${result.symbol} ${result.marketType} narx=${result.currentPrice} trend=${result.trend}`,
    `verdikt=${verdict.verdictLabel} side=${verdict.side ?? "-"} confluence=${verdict.confluence ?? "-"}`,
    `entry=${verdict.entryZone[0]}-${verdict.entryZone[1]} SL=${risk.stopLoss} TP=${risk.takeProfit} RR=${verdict.rrIdeal.toFixed(1)}`,
    `RSI=${indicators.rsi.toFixed(0)} ATR=${indicators.atr} EMA50=${indicators.ema50} EMA200=${indicators.ema200}`,
    `strategiya=${result.strategy.label} (${result.strategy.confidence}%)`,
    `BTC bozor rejimi=${verdict.btcNote ?? "-"}`,
  ].join(" | ");
}

const SUGGESTIONS = [
  "Bu setupni tushuntir",
  "Asosiy risklar nima?",
  "Nega bu yo'nalish tanlandi?",
];

export function ChatPanel({ result }: { result: AnalyzeResponse }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const send = async (text: string) => {
    if (!text.trim() || streaming) return;

    const userMessage: ChatMessage = { role: "user", content: text.trim() };
    const nextMessages = [...messages, userMessage];
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);

    try {
      await streamChat(nextMessages, buildContext(result), {
        onToken: (token) =>
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === "assistant") {
              updated[updated.length - 1] = {
                ...last,
                content: last.content + token,
              };
            }
            return updated;
          }),
      });
    } catch {
      toast.error("AI yordamchi bilan aloqa uzildi");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setStreaming(false);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      });
    }
  };

  return (
    <Card className="border">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4" />
          AI yordamchi
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          ref={scrollRef}
          className="max-h-72 space-y-3 overflow-y-auto"
          aria-live="polite"
        >
          {messages.length === 0 && (
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <Button
                  key={suggestion}
                  variant="outline"
                  size="sm"
                  onClick={() => void send(suggestion)}
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          )}

          {messages.map((message, index) => (
            <div
              key={index}
              className={cn(
                "flex",
                message.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted",
                )}
              >
                {message.content || (
                  <span className="text-muted-foreground">...</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="flex gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Savol bering..."
            disabled={streaming}
          />
          <Button type="submit" size="icon" disabled={streaming} aria-label="Yuborish">
            <Send className="size-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
