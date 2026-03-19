"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useApp } from "@/lib/store";
import { sendChatMessage, type Source } from "@/lib/api";

function getHighlightTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 5);
}

function renderHighlightedText(text: string, terms: string[]) {
  if (terms.length === 0) return text;

  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(regex);

  return parts.map((part, idx) => {
    const match = terms.some((term) => term.toLowerCase() === part.toLowerCase());
    return match ? (
      <mark key={idx} className="bg-cyan-400/20 text-cyan-100 px-0.5 rounded-sm">
        {part}
      </mark>
    ) : (
      <span key={idx}>{part}</span>
    );
  });
}

// ─── Thinking Indicator ─────────────────────────────────────────────

function ThinkingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex items-start gap-3 py-3"
    >
      <div className="w-8 h-8 rounded-xl bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 shadow-glow">
        <span className="text-white text-xs font-bold">AI</span>
      </div>
      <div className="glass rounded-2xl rounded-tl-sm px-4 py-3 max-w-md">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <span className="w-2 h-2 rounded-full bg-indigo-400 typing-dot" />
            <span className="w-2 h-2 rounded-full bg-purple-400 typing-dot" />
            <span className="w-2 h-2 rounded-full bg-pink-400 typing-dot" />
          </div>
          <span className="text-xs text-slate-400 ml-2">Retrieving chunks and drafting answer...</span>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Sources Panel ──────────────────────────────────────────────────

function SourcesPanel({
  sources,
  highlightTerms,
}: {
  sources: Source[];
  highlightTerms: string[];
}) {
  const [expanded, setExpanded] = useState(false);

  if (sources.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      className="mt-3"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
        <span>{sources.length} source{sources.length !== 1 ? "s" : ""} retrieved</span>
        <motion.svg
          animate={{ rotate: expanded ? 180 : 0 }}
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </motion.svg>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 space-y-2"
          >
            {sources.map((source) => (
              <div
                key={source.id}
                className="glass rounded-lg p-3 border-l-2 border-indigo-500/50"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">
                    Source {source.id}
                  </span>
                  {source.metadata.source_file && (
                    <span className="text-[10px] text-slate-500">
                      {source.metadata.source_file}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">
                  {renderHighlightedText(source.content, highlightTerms)}
                </p>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Message Bubble ─────────────────────────────────────────────────

function MessageBubble({
  role,
  content,
  sources,
  isStreaming,
  highlightTerms,
}: {
  role: string;
  content: string;
  sources?: Source[];
  isStreaming?: boolean;
  highlightTerms: string[];
}) {
  const isUser = role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 15, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={`w-full flex items-start gap-3 py-2 ${isUser ? "flex-row-reverse" : ""}`}
    >
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
          isUser
            ? "bg-linear-to-br from-cyan-500 to-blue-600"
            : "bg-linear-to-br from-indigo-500 to-purple-600 shadow-glow"
        }`}
      >
        <span className="text-white text-xs font-bold">
          {isUser ? "U" : "AI"}
        </span>
      </div>

      {/* Message */}
      <div
        className={`max-w-[min(760px,84%)] ${
          isUser
            ? "glass rounded-2xl rounded-tr-sm px-4 py-3"
            : "glass rounded-2xl rounded-tl-sm px-4 py-3"
        }`}
      >
        <div className="markdown-content text-sm leading-relaxed whitespace-pre-wrap">
          {content}
          {isStreaming && (
            <span className="inline-block w-0.5 h-4 bg-indigo-400 ml-0.5 cursor-blink align-text-bottom" />
          )}
        </div>

        {sources && <SourcesPanel sources={sources} highlightTerms={highlightTerms} />}
      </div>
    </motion.div>
  );
}

// ─── Welcome Screen ─────────────────────────────────────────────────

function WelcomeScreen() {
  const suggestions = [
    "What documents have been ingested?",
    "Summarize the key findings from uploaded documents",
    "What are the main topics covered?",
    "Find information about specific entities",
  ];
  const { handleSend } = useChatActions();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex-1 flex flex-col items-center justify-center px-8"
    >
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="w-20 h-20 rounded-3xl bg-linear-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center mb-8 shadow-glow-lg"
      >
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
          <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z" />
          <line x1="10" y1="22" x2="14" y2="22" />
          <line x1="9" y1="9" x2="15" y2="9" />
        </svg>
      </motion.div>

      <h2 className="text-2xl font-bold text-white mb-2">
        Enterprise <span className="text-gradient">RAG Assistant</span>
      </h2>
      <p className="text-slate-400 text-sm text-center max-w-md mb-8">
        Ask questions about your ingested documents. I&apos;ll retrieve relevant context
        and provide accurate, sourced answers.
      </p>

      <div className="grid grid-cols-2 gap-3 max-w-lg w-full">
        {suggestions.map((suggestion, idx) => (
          <motion.button
            key={idx}
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleSend(suggestion)}
            className="glass glass-hover rounded-xl p-3 text-left text-xs text-slate-300 leading-relaxed"
          >
            <span className="text-indigo-400 mr-1">→</span> {suggestion}
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Chat Actions Hook ──────────────────────────────────────────────

function useChatActions() {
  const {
    setMessages,
    addMessage,
    currentSessionId,
    setCurrentSessionId,
    setAIState,
    setCurrentSources,
    setSessions,
  } = useApp();

  const handleSend = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      // Add user message
      addMessage({ role: "user", content: text });
      setAIState("thinking");

      // Prepare streaming assistant message
      let assistantContent = "";

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "", isStreaming: true },
      ]);

      await sendChatMessage(
        text,
        currentSessionId,
        // onToken
        (token) => {
          assistantContent += token;
          setAIState("streaming");
          setMessages((prev) => {
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            updated[lastIdx] = {
              ...updated[lastIdx],
              content: assistantContent,
              isStreaming: true,
            };
            return updated;
          });
        },
        // onSources
        (sources) => {
          setCurrentSources(sources);
          setMessages((prev) => {
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            updated[lastIdx] = { ...updated[lastIdx], sources };
            return updated;
          });
        },
        // onDone
        (sessionId) => {
          setCurrentSessionId(sessionId);
          setAIState("done");
          setMessages((prev) => {
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            updated[lastIdx] = { ...updated[lastIdx], isStreaming: false };
            return updated;
          });

          // Refresh sessions
          import("@/lib/api").then(({ getChatSessions }) =>
            getChatSessions().then(setSessions)
          );

          // Reset to idle after a cooldown
          setTimeout(() => setAIState("idle"), 3000);
        },
        // onError
        (error) => {
          setAIState("idle");
          setMessages((prev) => {
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            updated[lastIdx] = {
              ...updated[lastIdx],
              content: `❌ Error: ${error}`,
              isStreaming: false,
            };
            return updated;
          });
        }
      );
    },
    [
      addMessage,
      currentSessionId,
      setAIState,
      setCurrentSessionId,
      setCurrentSources,
      setMessages,
      setSessions,
    ]
  );

  return { handleSend };
}

// ─── Chat Input ─────────────────────────────────────────────────────

function ChatInput() {
  const [input, setInput] = useState("");
  const { aiState } = useApp();
  const { handleSend } = useChatActions();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isProcessing = aiState === "thinking" || aiState === "streaming";

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isProcessing && input.trim()) {
      handleSend(input);
      setInput("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit(e);
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 150) + "px";
    }
  }, [input]);

  return (
    <div className="p-4 border-t border-white/5 flex justify-center">
      <form onSubmit={onSubmit} className="w-full max-w-5xl mx-auto">
        <div className="glass-strong rounded-2xl flex items-end gap-2 p-2 glow-border">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isProcessing ? "AI is generating..." : "Ask about your documents..."
            }
            disabled={isProcessing}
            rows={1}
            className="flex-1 bg-transparent text-base text-white placeholder-slate-500 resize-none outline-none px-4 py-2.5 max-h-37.5 disabled:opacity-50"
            id="chat-input"
          />
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            type="submit"
            disabled={isProcessing || !input.trim()}
            className="p-2.5 rounded-xl bg-linear-to-r from-indigo-600 to-purple-600 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-glow hover:shadow-glow-lg"
            id="send-button"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </motion.button>
        </div>
        <p className="text-[10px] text-slate-600 text-center mt-2">
          RAG-powered responses grounded in your uploaded documents
        </p>
      </form>
    </div>
  );
}

// ─── Main Chat Module ───────────────────────────────────────────────

export default function ChatModule() {
  const { messages, aiState, capabilities } = useApp();
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatUnavailable = Boolean(capabilities && !capabilities.modules.chat);

  const latestUserMessage = [...messages].reverse().find((m) => m.role === "user")?.content || "";
  const highlightTerms = getHighlightTerms(latestUserMessage);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);

  const hasMessages = messages.length > 0;

  return (
    <div className="flex-1 flex flex-col h-full">
      {chatUnavailable && (
        <div className="mx-auto mt-4 mb-2 max-w-5xl w-[94%] glass rounded-xl px-4 py-2 border border-yellow-500/20 text-xs text-yellow-200">
          Chat API is temporarily unreachable. Retrying in background.
        </div>
      )}

      {/* Messages Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 md:px-6">
        {!hasMessages ? (
          <WelcomeScreen />
        ) : (
          <div className="max-w-5xl mx-auto space-y-1.5">
            <AnimatePresence mode="popLayout">
              {messages.map((msg, idx) => (
                <MessageBubble
                  key={idx}
                  role={msg.role}
                  content={msg.content}
                  sources={msg.sources}
                  isStreaming={msg.isStreaming}
                  highlightTerms={highlightTerms}
                />
              ))}
            </AnimatePresence>

            {aiState === "thinking" && <ThinkingIndicator />}
          </div>
        )}
      </div>

      {/* Input */}
      <ChatInput />
    </div>
  );
}
