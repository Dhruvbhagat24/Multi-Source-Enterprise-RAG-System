import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from "@/lib/store";

export const metadata: Metadata = {
  title: "RAG System — Enterprise AI Assistant",
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
      <body className="antialiased">
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
