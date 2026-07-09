import { z } from "zod";

export const registerSchema = z.object({
  email: z
    .string()
    .trim()
    .email("email noto'g'ri")
    .transform((value) => value.toLowerCase()),
  name: z.string().trim().min(1, "ism majburiy").max(60),
  password: z.string().min(6, "parol kamida 6 ta belgi bo'lishi kerak").max(100),
});

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email("email noto'g'ri")
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1, "parol majburiy"),
});

export const settingsSchema = z
  .object({
    capital: z.coerce.number().positive().optional(),
    riskPercent: z.coerce
      .number()
      .positive()
      .max(10, "riskPercent 10% dan oshmasligi kerak")
      .optional(),
    marketType: z.enum(["spot", "futures"]).optional(),
    theme: z.enum(["light", "dark", "system"]).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Kamida bitta sozlama kerak",
  });

export type RegisterBody = z.infer<typeof registerSchema>;
export type LoginBody = z.infer<typeof loginSchema>;
export type SettingsBody = z.infer<typeof settingsSchema>;
