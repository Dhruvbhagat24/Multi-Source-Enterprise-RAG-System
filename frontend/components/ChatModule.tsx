"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useApp } from "@/lib/store";
import { sendChatMessage, uploadDocument, type Source } from "@/lib/api";

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
      <mark key={idx} className="rounded-sm bg-cyan-400/20 px-0.5 text-cyan-100">
        {part}
      </mark>
    ) : (
      <span key={idx}>{part}</span>
    );
  });
}

function ThinkingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex items-start gap-3 py-1"
    >
      <div className="shadow-glow flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-indigo-500 to-purple-600">
        <span className="text-xs font-bold text-white">AI</span>
      </div>
      <div className="glass max-w-md rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <span className="typing-dot h-2 w-2 rounded-full bg-indigo-400" />
            <span className="typing-dot h-2 w-2 rounded-full bg-purple-400" />
            <span className="typing-dot h-2 w-2 rounded-full bg-pink-400" />
          </div>
          <span className="ml-2 text-xs text-slate-400">Retrieving chunks and drafting answer...</span>
        </div>
      </div>
    </motion.div>
  );
}

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
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs text-indigo-400 transition-colors hover:text-indigo-300"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
        <span>
          {sources.length} source{sources.length !== 1 ? "s" : ""} retrieved
        </span>
        <motion.svg animate={{ rotate: expanded ? 180 : 0 }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </motion.svg>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-2 space-y-2">
            {sources.map((source) => (
              <div key={source.id} className="glass rounded-lg border-l-2 border-indigo-500/50 p-3">
                <div className="mb-1 flex items-center gap-2">
                  <span className="rounded bg-indigo-500/10 px-2 py-0.5 font-mono text-[10px] text-indigo-400">
                    Source {source.id}
                  </span>
                  {source.metadata.source_file && (
                    <span className="text-[10px] text-slate-500">{source.metadata.source_file}</span>
                  )}
                </div>
                <p className="line-clamp-3 text-xs leading-relaxed text-slate-400">
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
      className={`flex w-full items-start gap-3 py-2 ${isUser ? "flex-row-reverse" : ""}`}
    >
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
          isUser ? "bg-linear-to-br from-cyan-500 to-blue-600" : "shadow-glow bg-linear-to-br from-indigo-500 to-purple-600"
        }`}
      >
        <span className="text-xs font-bold text-white">{isUser ? "U" : "AI"}</span>
      </div>

      <div className={`max-w-[min(760px,84%)] ${isUser ? "glass rounded-2xl rounded-tr-sm px-4 py-3" : "glass rounded-2xl rounded-tl-sm px-4 py-3"}`}>
        <div className="markdown-content whitespace-pre-wrap text-sm leading-relaxed">
          {content}
          {isStreaming && <span className="ml-0.5 inline-block h-4 w-0.5 cursor-blink bg-indigo-400 align-text-bottom" />}
        </div>

        {sources && <SourcesPanel sources={sources} highlightTerms={highlightTerms} />}
      </div>
    </motion.div>
  );
}

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
      className="mx-auto flex w-full max-w-3xl flex-col items-center justify-center px-4 sm:px-6"
    >
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="mb-8 flex h-20 w-20 items-center justify-center rounded-3xl bg-linear-to-br from-indigo-500 via-purple-500 to-pink-500 shadow-glow-lg"
      >
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
          <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z" />
          <line x1="10" y1="22" x2="14" y2="22" />
          <line x1="9" y1="9" x2="15" y2="9" />
        </svg>
      </motion.div>

      <h2 className="mb-2 text-3xl font-bold text-white sm:text-4xl">
        Enterprise <span className="text-gradient">RAG Assistant</span>
      </h2>
      <p className="mb-8 max-w-2xl text-center text-base leading-relaxed text-slate-400 sm:text-lg">
        Ask questions about your ingested documents. I&apos;ll retrieve relevant context and provide accurate, sourced answers.
      </p>

      <div className="grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
        {suggestions.map((suggestion, idx) => (
          <motion.button
            key={idx}
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleSend(suggestion)}
            className="glass glass-hover rounded-xl p-3 text-left text-sm leading-relaxed text-slate-300"
          >
            <span className="mr-1 text-sm text-indigo-400 sm:text-base">→</span> {suggestion}
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}

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

      addMessage({ role: "user", content: text });
      setAIState("thinking");

      let assistantContent = "";
      setMessages((prev) => [...prev, { role: "assistant", content: "", isStreaming: true }]);

      await sendChatMessage(
        text,
        currentSessionId,
        null,
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
        (sources) => {
          setCurrentSources(sources);
          setMessages((prev) => {
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            updated[lastIdx] = { ...updated[lastIdx], sources };
            return updated;
          });
        },
        (sessionId) => {
          setCurrentSessionId(sessionId);
          setAIState("done");
          setMessages((prev) => {
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            updated[lastIdx] = { ...updated[lastIdx], isStreaming: false };
            return updated;
          });

          import("@/lib/api").then(({ getChatSessions }) => getChatSessions().then(setSessions));
          setTimeout(() => setAIState("idle"), 3000);
        },
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
    [addMessage, currentSessionId, setAIState, setCurrentSessionId, setCurrentSources, setMessages, setSessions]
  );

  return { handleSend };
}

function ChatInput() {
  const [input, setInput] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<string>("");
  const [menuOpen, setMenuOpen] = useState(false);
  const { aiState, capabilities, setPendingUploads, setActiveModule } = useApp();
  const { handleSend } = useChatActions();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachButtonRef = useRef<HTMLButtonElement>(null);
  const attachmentMenuRef = useRef<HTMLDivElement>(null);

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

  const handleAttachClick = () => {
    if (isUploading || (capabilities ? !capabilities.modules.documents : false)) return;
    setMenuOpen((prev) => !prev);
  };

  const handleUploadAction = () => {
    setMenuOpen(false);
    fileInputRef.current?.click();
  };

  const handleManageDocsAction = () => {
    setMenuOpen(false);
    setActiveModule("documents");
  };

  const handleCreateImageAction = () => {
    setInput((prev) => (prev.trim() ? `${prev}\nCreate an image for this topic.` : "Create an image for: "));
    setMenuOpen(false);
    textareaRef.current?.focus();
  };

  const handleThinkingAction = () => {
    setInput((prev) => (prev.trim() ? `Think step by step and answer:\n${prev}` : "Think step by step and answer: "));
    setMenuOpen(false);
    textareaRef.current?.focus();
  };

  const handleDeepResearchAction = () => {
    setInput((prev) => (prev.trim() ? `Do deep research on: ${prev}` : "Do deep research on: "));
    setMenuOpen(false);
    textareaRef.current?.focus();
  };

  const handleUploadFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    setIsUploading(true);
    setUploadNotice(`Uploading ${files.length} file${files.length > 1 ? "s" : ""}...`);
    setPendingUploads((prev: string[]) => [...prev, ...files.map((f) => f.name)]);

    let success = 0;
    let failed = 0;

    for (const file of files) {
      try {
        await uploadDocument(file);
        success += 1;
      } catch {
        failed += 1;
      } finally {
        setPendingUploads((prev: string[]) => prev.filter((name) => name !== file.name));
      }
    }

    setIsUploading(false);
    setUploadNotice(
      failed === 0
        ? `Uploaded ${success} file${success > 1 ? "s" : ""}. Ready for chat.`
        : `Uploaded ${success}, failed ${failed}. Please retry failed files.`
    );

    setTimeout(() => setUploadNotice(""), 4000);
  }, [setPendingUploads]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      void handleUploadFiles(Array.from(e.target.files));
    }
    e.target.value = "";
  };

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedAttach = attachButtonRef.current?.contains(target);
      const clickedMenu = attachmentMenuRef.current?.contains(target);
      if (!clickedAttach && !clickedMenu) {
        setMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + "px";
    }
  }, [input]);

  return (
    <div className="pointer-events-auto flex w-full justify-center px-4 sm:px-6">
      <form onSubmit={onSubmit} className="w-full max-w-210">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.doc,.xlsx,.xls,.csv"
          className="hidden"
          onChange={handleFileSelect}
          aria-label="Attach documents"
        />

        {uploadNotice && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="mb-2 flex items-center gap-2 rounded-xl border border-indigo-400/20 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-100"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-300" />
            <span>{uploadNotice}</span>
          </motion.div>
        )}

        <div className="relative glass-strong glow-border flex items-center rounded-[22px] border border-white/10 px-3 py-2 min-h-14 shadow-[0_18px_40px_rgba(4,8,20,0.45)]">
          <button
            ref={attachButtonRef}
            type="button"
            onClick={handleAttachClick}
            disabled={isUploading || (capabilities ? !capabilities.modules.documents : false)}
            className={`absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${menuOpen ? "bg-indigo-500/20 text-indigo-200" : "hover:bg-white/10 hover:text-white"}`}
            title="Attach documents"
            aria-label="Attach documents"
          >
            <span className="text-xl leading-none">+</span>
          </button>

          <AnimatePresence>
            {menuOpen && (
              <motion.div
                ref={attachmentMenuRef}
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.14 }}
                className="absolute bottom-full left-0 z-30 mb-3 w-80 origin-bottom-left overflow-hidden rounded-2xl border border-white/10 bg-slate-800/96 p-3 shadow-[0_20px_44px_rgba(0,0,0,0.55)] backdrop-blur-xl"
              >
                <button
                  type="button"
                  onClick={handleUploadAction}
                  className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] leading-none text-white transition-colors hover:bg-white/7"
                >
                  <span className="text-white/90">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21.44 11.05l-9.19 9.19a5.5 5.5 0 0 1-7.78-7.78l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95l-9.2 9.19a1.5 1.5 0 0 1-2.12-2.12l8.49-8.48" />
                    </svg>
                  </span>
                  <span className="text-[15px] leading-none">Add photos & files</span>
                </button>

                <div className="my-1.5 border-t border-white/15" />

                <button
                  type="button"
                  onClick={handleCreateImageAction}
                  className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] leading-none text-white transition-colors hover:bg-white/7"
                >
                  <span className="text-white/90">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                  </span>
                  <span className="text-[15px] leading-none">Create image</span>
                </button>

                <button
                  type="button"
                  onClick={handleThinkingAction}
                  className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] leading-none text-white transition-colors hover:bg-white/7"
                >
                  <span className="text-white/90">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.8-2 2.3-2 4" />
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  </span>
                  <span className="text-[15px] leading-none">Thinking</span>
                </button>

                <button
                  type="button"
                  onClick={handleDeepResearchAction}
                  className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] leading-none text-white transition-colors hover:bg-white/7"
                >
                  <span className="text-white/90">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 10h4" />
                      <path d="M12 8v4" />
                      <path d="M12 14v6" />
                      <path d="M8 20h8" />
                      <path d="M3 10h4" />
                      <path d="M17 10h4" />
                    </svg>
                  </span>
                  <span className="text-[15px] leading-none">Deep research</span>
                </button>

                <button
                  type="button"
                  onClick={handleManageDocsAction}
                  className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] leading-none text-white transition-colors hover:bg-white/7"
                >
                  <span className="text-white/90">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="5" cy="12" r="1" />
                      <circle cx="12" cy="12" r="1" />
                      <circle cx="19" cy="12" r="1" />
                    </svg>
                  </span>
                  <span className="text-[15px] leading-none">More</span>
                  <span className="ml-auto text-white/80">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex flex-1 items-center">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isProcessing ? "AI is generating..." : "Ask about your documents..."}
              disabled={isProcessing}
              rows={1}
              id="chat-input"
              className="w-full resize-none bg-transparent pl-16 pr-12 py-3 text-base leading-7 text-white outline-none placeholder:leading-7 placeholder:text-slate-400"
            />
          </div>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            type="submit"
            disabled={isProcessing || !input.trim()}
            className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl bg-linear-to-r from-indigo-600 to-purple-600 text-white"
          >
            ✈️
          </motion.button>
        </div>
      </form>
    </div>
  );
}

export default function ChatModule() {
  const { messages, aiState, capabilities } = useApp();
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatUnavailable = Boolean(capabilities && !capabilities.modules.chat);

  const latestUserMessage = [...messages].reverse().find((m) => m.role === "user")?.content || "";
  const highlightTerms = getHighlightTerms(latestUserMessage);

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
    <div className="relative flex h-full min-h-0 flex-1 flex-col">
      {chatUnavailable && (
        <div className="mx-auto mt-4 w-full max-w-4xl rounded-xl border border-yellow-500/20 px-4 py-2 text-xs text-yellow-200 glass">
          Chat API is temporarily unreachable. Retrying in background.
        </div>
      )}

      <div
        ref={scrollRef}
        className={`flex-1 min-h-0 px-2 py-4 pb-82 sm:px-4 sm:py-6 sm:pb-90 ${hasMessages ? "overflow-y-auto" : "flex items-center justify-center overflow-y-auto"}`}
      >
        {!hasMessages ? (
          <WelcomeScreen />
        ) : (
          <div className="mx-auto w-full max-w-210 space-y-4">
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

      <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 sm:bottom-8">
        <ChatInput />
      </div>
    </div>
  );
}
