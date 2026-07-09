import { z } from "zod";

export const chatBodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(30),
  context: z.string().max(4000).optional(),
});

export type ChatBody = z.infer<typeof chatBodySchema>;
