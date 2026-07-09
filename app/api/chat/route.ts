import {
  createRouteHandler,
  createSSEStream,
} from "@/lib/server/http/route";
import {
  isOpenAiConfigured,
  streamChat,
} from "@/lib/server/services/openai.service";
import {
  chatBodySchema,
  type ChatBody,
} from "@/lib/server/validators/chat.validator";

export const POST = createRouteHandler(
  async (ctx) => {
    const { messages, context } = ctx.body as ChatBody;

    if (!isOpenAiConfigured()) {
      return createSSEStream(async (write) => {
        write({
          token:
            "AI yordamchi hozircha mavjud emas (API kaliti sozlanmagan).",
        });
      });
    }

    return createSSEStream(async (write) => {
      try {
        for await (const token of streamChat(messages, context)) {
          write({ token });
        }
      } catch (error) {
        console.error("Chat oqim xatosi:", error);
        write({ error: "AI javobida xato" });
      }
    });
  },
  { auth: true, bodySchema: chatBodySchema },
);
