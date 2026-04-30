/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  async function handleGoogle() {
    setIsLoading(true);
    await signIn("google", { callbackUrl: "/" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/local/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.status === 201) {
        // Automatically sign in after signup
        const r: any = await signIn("credentials", { redirect: false, email, password });
        if (!r?.error) {
          router.push("/");
        } else {
          setError(r.error || "Sign in failed");
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
    <div style={{ minHeight: "100vh", background: "#0d1117" }} className="flex items-center justify-center p-4">
      <div
        style={{
          background: "#161b22",
          borderColor: "rgba(255, 255, 255, 0.1)",
        }}
        className="w-full max-w-[400px] rounded-2xl border p-8 shadow-lg"
      >
        <h2 className="text-xs font-medium text-gray-400 mb-6 text-center tracking-widest">eNeural Console</h2>
        <h1 className="text-2xl font-semibold mb-6 text-center">Create account</h1>

        <button
          onClick={handleGoogle}
          disabled={isLoading}
          style={{ background: "#7c3aed" }}
          className="w-full text-white py-2 rounded-lg mb-4 font-medium hover:opacity-90 transition disabled:opacity-50"
        >
          Continue with Google
        </button>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div style={{ borderColor: "rgba(255, 255, 255, 0.1)" }} className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span style={{ background: "#161b22" }} className="px-2 text-gray-400">
              or sign up with email
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            style={{
              background: "#0d1117",
              borderColor: "rgba(255, 255, 255, 0.1)",
            }}
            className="w-full p-3 rounded-xl bg-[#0d1117] text-white border placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#7c3aed] focus:ring-opacity-50 transition"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading}
          />
          <input
            type="password"
            style={{
              background: "#0d1117",
              borderColor: "rgba(255, 255, 255, 0.1)",
            }}
            className="w-full p-3 rounded-xl bg-[#0d1117] text-white border placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#7c3aed] focus:ring-opacity-50 transition"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
          />
          {error && <div className="text-sm text-red-400 font-medium">{error}</div>}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 rounded-lg text-white font-medium transition hover:opacity-90 disabled:opacity-50"
            style={{ background: "#7c3aed" }}
          >
            {isLoading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <div className="mt-6 text-sm text-center text-gray-400">
          Already have an account?{" "}
          <a href="/login" className="text-[#7c3aed] hover:underline font-medium">
            Sign in
          </a>
        </div>
      </div>
    </div>
  );
}
