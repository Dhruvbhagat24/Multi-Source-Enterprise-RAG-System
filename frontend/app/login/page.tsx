/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import AuthShell from "@/components/auth/AuthShell";
import { normalizeEmail, validateLoginInput } from "@/lib/auth/validation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  async function handleGoogle() {
    setError(null);
    setIsLoading(true);
    await signIn("google", { callbackUrl: "/" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const validationError = validateLoginInput(email, password);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);
    const res: any = await signIn("credentials", {
      redirect: false,
      email: normalizeEmail(email),
      password,
    });
    if (res?.error) {
      setError("Invalid email or password.");
      setIsLoading(false);
    } else {
      router.push("/");
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Access your workspace with secure authentication."
      bottomText="Don't have an account?"
      bottomLinkHref="/signup"
      bottomLinkLabel="Sign up"
    >
      <div className="auth-stack">
        <button onClick={handleGoogle} disabled={isLoading} className="auth-primary-btn">
          Continue with Google
        </button>

        <div className="auth-divider">
          <span>or use your email</span>
        </div>

        <form onSubmit={handleSubmit} className="auth-stack">
          <input
            type="email"
            className="auth-input"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            disabled={isLoading}
          />
          <input
            type="password"
            className="auth-input"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            disabled={isLoading}
          />
          {error && <div className="auth-error">{error}</div>}
          <button type="submit" disabled={isLoading} className="auth-primary-btn">
            {isLoading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </AuthShell>
  );
}
