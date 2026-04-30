import type { Metadata } from "next";
import "./globals.css";
import NextAuthProvider from "./providers/NextAuthProvider";

export const metadata: Metadata = {
  title: "eNeural Console — Enterprise AI Assistant",
  description:
    "A production-grade RAG (Retrieval-Augmented Generation) system with immersive 3D visualization, multi-source document ingestion, and intelligent AI responses.",
  keywords: [
    "RAG",
    "AI Assistant",
    "Enterprise",
    "Document Ingestion",
    "Vector Database",
    "LLM",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-[#0d1117] text-white">
        <NextAuthProvider>{children}</NextAuthProvider>
      </body>
    </html>
  );
}
