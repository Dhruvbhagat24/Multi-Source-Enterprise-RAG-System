"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Project } from "@/lib/store";

function SourcesCollapsible({ sources }: { sources: import("@/lib/api").Source[] }) {
  const [expanded, setExpanded] = useState(false);
  if (sources.length === 0) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1.5 text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
        <span>{sources.length} source{sources.length !== 1 ? "s" : ""}</span>
        <motion.svg animate={{ rotate: expanded ? 180 : 0 }} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></motion.svg>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-1.5" style={{ marginTop: 6 }}>
            {sources.map((s) => (
              <div key={s.id} className="rounded-md border-l-2 border-indigo-500/40 text-[11px] text-slate-400 leading-relaxed" style={{ background: "rgba(99,102,241,0.04)", padding: "6px 8px" }}>
                <span className="font-mono text-[9px] text-indigo-400/70">Source {s.id}</span>
                {s.metadata.source_file && <span className="ml-2 text-[9px] text-slate-500">{s.metadata.source_file}</span>}
                <p className="line-clamp-2" style={{ marginTop: 2 }}>{s.content}</p>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ProjectChatView({ project, activeChatId, userId, onBack, onUpdateProject }: {
  project: Project;
  activeChatId: string;
  userId: string | undefined;
  onBack: () => void;
  onUpdateProject: (u: Project | ((p: Project) => Project)) => void;
}) {
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<{ role: string; content: string; sources?: import("@/lib/api").Source[]; isStreaming?: boolean }[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isNewChat = useRef(false);

  useEffect(() => {
    const chat = project.chats?.find(c => c.id === activeChatId);
    if (chat && chat.messages.length > 0) { setMessages(chat.messages); }
    else { isNewChat.current = true; }
  }, [activeChatId, project.chats]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, isThinking]);

  useEffect(() => {
    if (textareaRef.current) { textareaRef.current.style.height = "auto"; textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + "px"; }
  }, [chatInput]);

  const isProcessing = isThinking || isStreaming;
  const hasMessages = messages.length > 0;

  const saveChat = useCallback((msgs: typeof messages, firstMsg?: string) => {
    onUpdateProject((p) => {
      const chats = p.chats || [];
      const idx = chats.findIndex(c => c.id === activeChatId);
      const title = idx >= 0 ? chats[idx].title : (firstMsg || msgs.find(m => m.role === "user")?.content || "Chat").substring(0, 60);
      const chatObj = { id: activeChatId, title, messages: msgs.map(m => ({ role: m.role, content: m.content, sources: m.sources })), createdAt: idx >= 0 ? chats[idx].createdAt : new Date().toLocaleDateString() };
      const newChats = idx >= 0 ? chats.map((c, i) => i === idx ? chatObj : c) : [chatObj, ...chats];
      return { ...p, chats: newChats, chatCount: idx >= 0 ? p.chatCount : p.chatCount + 1, lastActivity: new Date().toLocaleDateString() };
    });
  }, [activeChatId, onUpdateProject]);

  const handleSendMessage = useCallback(async (text?: string) => {
    const msgText = text || chatInput.trim();
    if (!msgText || isThinking || isStreaming) return;
    setChatInput("");
    const userMsg = { role: "user", content: msgText };
    const assistantMsg = { role: "assistant", content: "", isStreaming: true };
    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setIsThinking(true);

    const { sendChatMessage } = await import("@/lib/api");
    let content = "";
    const projFiles = project.files.map(f => f.name).filter(n => !n.includes("Processing"));

    if (!userId) return;
    await sendChatMessage(msgText, null, userId, projFiles,
      (token: string) => { content += token; setIsThinking(false); setIsStreaming(true); setMessages(prev => { const u = [...prev]; u[u.length - 1] = { ...u[u.length - 1], content, isStreaming: true }; return u; }); },
      (sources) => { setMessages(prev => { const u = [...prev]; u[u.length - 1] = { ...u[u.length - 1], sources }; return u; }); },
      () => { setIsThinking(false); setIsStreaming(false); setMessages(prev => { const u = [...prev]; u[u.length - 1] = { ...u[u.length - 1], isStreaming: false }; saveChat(u, msgText); return u; }); },
      (error) => { setIsThinking(false); setIsStreaming(false); setMessages(prev => { const u = [...prev]; u[u.length - 1] = { ...u[u.length - 1], content: `❌ Error: ${error}`, isStreaming: false }; return u; }); }
    );
  }, [chatInput, isThinking, isStreaming, project.files, saveChat]);

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col items-center">
      <div className="flex-1 flex min-h-0 w-full max-w-230 flex-col" style={{ padding: "24px 20px 28px" }}>
        <div className="mb-5 flex items-center justify-between border-b border-white/5 pb-4">
          <button onClick={onBack} className="flex items-center gap-1.5 text-[13px] text-slate-400 hover:text-white transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
            Back to {project.name}
          </button>
          <span className="max-w-75 truncate text-[13px] font-medium text-slate-500">{project.chats?.find(c => c.id === activeChatId)?.title || "New Chat"}</span>
        </div>

        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto pr-1.5" style={{ marginBottom: 18 }}>
          {!hasMessages ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.15))" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-indigo-400"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
              </div>
              <h3 className="text-white font-medium mb-2">How can I help with {project.name}?</h3>
              <p className="text-[13px] text-slate-400 max-w-md">Ask questions about your project sources or brainstorm ideas.</p>
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                {[`Summarize the ${project.name} project`, "What are the key topics?"].map((s, i) => (
                  <button key={i} onClick={() => handleSendMessage(s)} className="rounded-lg text-[12px] text-indigo-400 hover:bg-indigo-500/10 transition-colors" style={{ padding: "6px 12px", border: "1px solid rgba(99,102,241,0.20)" }}>→ {s}</button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <AnimatePresence mode="popLayout">
                {messages.map((msg, idx) => (
                  <motion.div key={idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
                    className={`flex items-start gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${msg.role === "user" ? "bg-linear-to-br from-cyan-500 to-blue-600" : "bg-linear-to-br from-indigo-500 to-purple-600"}`}>
                      <span className="text-[11px] font-bold text-white">{msg.role === "user" ? "U" : "AI"}</span>
                    </div>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${msg.role === "user" ? "rounded-tr-sm" : "rounded-tl-sm"}`}
                      style={{ background: msg.role === "user" ? "rgba(6,182,212,0.08)" : "rgba(99,102,241,0.06)", border: `1px solid ${msg.role === "user" ? "rgba(6,182,212,0.12)" : "rgba(99,102,241,0.10)"}` }}>
                      <p className="text-[14px] text-slate-200 leading-relaxed whitespace-pre-wrap">
                        {msg.content}{msg.isStreaming && <span className="ml-0.5 inline-block h-3.5 w-0.5 bg-indigo-400 align-text-bottom animate-pulse" />}
                      </p>
                      {msg.sources && msg.sources.length > 0 && <SourcesCollapsible sources={msg.sources} />}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {isThinking && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-indigo-500 to-purple-600">
                    <span className="text-[11px] font-bold text-white">AI</span>
                  </div>
                  <div className="rounded-2xl rounded-tl-sm px-4 py-3" style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.10)" }}>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce" /><span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "150ms" }} /><span className="h-1.5 w-1.5 rounded-full bg-pink-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                      <span className="text-[12px] text-slate-500">Thinking...</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </div>

        <div className="relative mt-1 rounded-2xl" style={{ border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.02)" }}>
          <div style={{ padding: "14px 18px 8px" }}>
            <textarea ref={textareaRef} value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={handleKeyDown}
              placeholder={isProcessing ? "AI is generating..." : "Message project AI..."} disabled={isProcessing} rows={1}
              className="w-full resize-none bg-transparent text-[14px] text-white outline-none placeholder:text-slate-500 leading-relaxed" style={{ maxHeight: 150 }} />
          </div>
          <div className="flex items-center justify-end" style={{ padding: "8px 14px 12px" }}>
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => handleSendMessage()}
              disabled={isProcessing || !chatInput.trim()}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-white transition-all disabled:opacity-30"
              style={{ background: chatInput.trim() && !isProcessing ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : "rgba(99,102,241,0.2)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}
