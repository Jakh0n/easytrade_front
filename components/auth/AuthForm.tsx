"use client";

import { LineChart } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { useAuthStore } from "@/lib/store/auth";

interface AuthFormProps {
  mode: "login" | "register";
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const login = useAuthStore((state) => state.login);
  const register = useAuthStore((state) => state.register);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [status, router]);

  const isLogin = mode === "login";

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await register(email, password, name);
      }
      router.replace("/dashboard");
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "Xato yuz berdi";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm border shadow-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <LineChart className="size-5" />
          </div>
          <CardTitle className="text-xl">
            {isLogin ? "Xush kelibsiz" : "Ro'yxatdan o'tish"}
          </CardTitle>
          <CardDescription>
            {isLogin
              ? "Hisobingizga kiring"
              : "Yangi trading hisobingizni yarating"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            {!isLogin && (
              <div className="space-y-1.5">
                <label htmlFor="name" className="text-sm font-medium">
                  Ism
                </label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium">
                Parol
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={isLogin ? "current-password" : "new-password"}
              />
            </div>
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={submitting}
            >
              {submitting
                ? "Kuting..."
                : isLogin
                  ? "Kirish"
                  : "Ro'yxatdan o'tish"}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            {isLogin ? "Hisobingiz yo'qmi? " : "Hisobingiz bormi? "}
            <Link
              href={isLogin ? "/register" : "/login"}
              className="font-medium text-primary hover:underline"
            >
              {isLogin ? "Ro'yxatdan o'ting" : "Kiring"}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
