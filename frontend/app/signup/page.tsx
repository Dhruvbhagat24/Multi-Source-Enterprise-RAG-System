/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import AuthShell from "@/components/auth/AuthShell";
import { normalizeEmail, validateSignupInput } from "@/lib/auth/validation";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
    const validationError = validateSignupInput(email, password, confirmPassword);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);
    try {
      const normalizedEmail = normalizeEmail(email);
      const res = await fetch("/api/auth/local/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, password }),
      });
      if (res.status === 201) {
        // Automatically sign in after signup
        const r: any = await signIn("credentials", { redirect: false, email: normalizedEmail, password });
        if (!r?.error) {
          router.push("/");
        } else {
          setError("Account created, but sign in failed. Please sign in manually.");
          setIsLoading(false);
        }
      } else {
        const data = await res.json();
        setError(data?.error || "Signup failed");
        setIsLoading(false);
      }
    } catch (e: any) {
      setError(e.message || "Signup failed");
      setIsLoading(false);
    }
  }

  return (
    <AuthShell
      title="Create account"
      subtitle="Set up your account to start using eNeural Console."
      bottomText="Already have an account?"
      bottomLinkHref="/login"
      bottomLinkLabel="Sign in"
    >
      <div className="auth-stack">
        <button onClick={handleGoogle} disabled={isLoading} className="auth-primary-btn">
          Continue with Google
        </button>

        <div className="auth-divider">
          <span>or sign up with email</span>
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
            autoComplete="new-password"
            disabled={isLoading}
          />
          <input
            type="password"
            className="auth-input"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            disabled={isLoading}
          />
          {error && <div className="auth-error">{error}</div>}
          <button type="submit" disabled={isLoading} className="auth-primary-btn">
            {isLoading ? "Creating account..." : "Create account"}
          </button>
        </form>
      </div>
    </AuthShell>
  );
}
