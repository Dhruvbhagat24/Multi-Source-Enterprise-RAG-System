"use client";

import React, { useEffect } from "react";
import { SessionProvider, useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { AppProvider } from "@/lib/store";

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  const publicPaths = ["/login", "/signup", "/api/auth"];
  const isPublicPage = publicPaths.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (status === "unauthenticated" && !isPublicPage) {
      router.push("/login");
    }
    if (status === "authenticated" && (pathname === "/login" || pathname === "/signup")) {
      router.push("/");
    }
  }, [status, pathname, router, isPublicPage]);

  // Show loading spinner while session is being determined
  if (status === "loading") {
    return (
      <div style={{ minHeight: "100vh", background: "#0d1117" }} className="flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div
            style={{
              width: 40,
              height: 40,
              border: "3px solid rgba(124, 58, 237, 0.2)",
              borderTopColor: "#7c3aed",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <span className="text-sm text-gray-400 tracking-wide">Loading…</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  // If unauthenticated and not on a public page, don't render children (redirect is happening)
  if (status === "unauthenticated" && !isPublicPage) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d1117" }} className="flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div
            style={{
              width: 40,
              height: 40,
              border: "3px solid rgba(124, 58, 237, 0.2)",
              borderTopColor: "#7c3aed",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <span className="text-sm text-gray-400 tracking-wide">Redirecting to login…</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default function NextAuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AppProvider>
        <AuthGuard>{children}</AuthGuard>
      </AppProvider>
    </SessionProvider>
  );
}
