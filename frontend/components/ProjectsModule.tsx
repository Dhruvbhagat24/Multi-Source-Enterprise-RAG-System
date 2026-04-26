"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useApp, type Project } from "@/lib/store";

/* ─── Create Project Modal ──────────────────────────────────────────── */

function CreateProjectModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, desc: string) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameInputRef.current?.focus(); }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2 }}
        className="w-full rounded-2xl"
        style={{ maxWidth: 560, background: "rgba(18,18,32,0.98)", border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 20px 60px rgba(0,0,0,0.5)", padding: "32px" }}
      >
        <h2 className="text-[20px] font-bold text-white" style={{ marginBottom: 20 }}>Create a personal project</h2>

        <div className="rounded-xl" style={{ padding: "16px 18px", marginBottom: 24, background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.12)" }}>
          <p className="text-[13px] font-semibold text-white" style={{ marginBottom: 8 }}>How to use projects</p>
          <p className="text-[12px] text-slate-400" style={{ lineHeight: "1.7", marginBottom: 8 }}>
            Projects help organize your work and leverage knowledge across multiple conversations. Upload docs, code, and files to create themed collections that the AI can reference again and again.
          </p>
          <p className="text-[12px] text-slate-400" style={{ lineHeight: "1.7" }}>
            Start by creating a memorable title and description to organize your project. You can always edit it later.
          </p>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label className="block text-[13px] font-medium text-slate-300" style={{ marginBottom: 8 }}>What are you working on?</label>
          <input ref={nameInputRef} type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name your project"
            className="w-full text-[13px] text-white outline-none placeholder:text-slate-500"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "12px 14px" }}
            onFocus={(e) => (e.target.style.borderColor = "rgba(99,102,241,0.5)")}
            onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.12)")}
          />
        </div>

        <div style={{ marginBottom: 28 }}>
          <label className="block text-[13px] font-medium text-slate-300" style={{ marginBottom: 8 }}>What are you trying to achieve?</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe your project, goals, subject, etc..." rows={4}
            className="w-full resize-none text-[13px] text-white outline-none placeholder:text-slate-500"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "12px 14px", lineHeight: "1.6" }}
            onFocus={(e) => (e.target.style.borderColor = "rgba(99,102,241,0.5)")}
            onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.12)")}
          />
        </div>

        <div className="flex items-center justify-end gap-3">
          <button onClick={onClose} className="rounded-lg text-[13px] font-medium text-slate-300 hover:bg-white/5 hover:text-white"
            style={{ padding: "9px 20px", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 8 }}>Cancel</button>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={() => { if (name.trim()) onCreate(name.trim(), description.trim()); }}
            className="rounded-lg text-[13px] font-medium text-white"
            style={{ padding: "9px 24px", background: name.trim() ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : "rgba(99,102,241,0.3)", borderRadius: 8, opacity: name.trim() ? 1 : 0.6, cursor: name.trim() ? "pointer" : "not-allowed" }}>
            Create project
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─── Sources Collapsible ────────────────────────────────────────────── */

function SourcesCollapsible({ sources }: { sources: import("@/lib/api").Source[] }) {
  const [expanded, setExpanded] = useState(false);
  if (sources.length === 0) return null;

  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
        <span>{sources.length} source{sources.length !== 1 ? "s" : ""}</span>
        <motion.svg animate={{ rotate: expanded ? 180 : 0 }} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </motion.svg>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-1.5" style={{ marginTop: 6 }}>
            {sources.map((source) => (
              <div key={source.id} className="rounded-md border-l-2 border-indigo-500/40 text-[11px] text-slate-400 leading-relaxed" style={{ background: "rgba(99,102,241,0.04)", padding: "6px 8px" }}>
                <span className="font-mono text-[9px] text-indigo-400/70">Source {source.id}</span>
                {source.metadata.source_file && <span className="ml-2 text-[9px] text-slate-500">{source.metadata.source_file}</span>}
                <p className="line-clamp-2" style={{ marginTop: 2 }}>{source.content}</p>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Project Detail View ───────────────────────────────────────────── */

function ProjectDetailView({ project, onBack, onUpdateProject, onDeleteProject }: {
  project: Project;
  onBack: () => void;
  onUpdateProject: (updated: Project | ((prev: Project) => Project)) => void;
  onDeleteProject: (id: string) => void;
}) {
  const [chatInput, setChatInput] = useState("");
  const [showInstructionsInput, setShowInstructionsInput] = useState(false);
  const [instructions, setInstructions] = useState(project.instructions);
  const [starred, setStarred] = useState(false);
  const [optionsMenuOpen, setOptionsMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const optionsRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Track which files are still being ingested (by filename)
  const [processingFiles, setProcessingFiles] = useState<Set<string>>(new Set());

  // Chat state
  const [messages, setMessages] = useState<{ role: string; content: string; sources?: import("@/lib/api").Source[]; isStreaming?: boolean }[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const attachButtonRef = useRef<HTMLButtonElement>(null);
  const attachmentMenuRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, isThinking]);

  // Close options menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (optionsRef.current && !optionsRef.current.contains(e.target as Node)) {
        setOptionsMenuOpen(false);
        setConfirmDelete(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close attachment menu on outside click
  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!attachButtonRef.current?.contains(target) && !attachmentMenuRef.current?.contains(target)) setMenuOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => { document.removeEventListener("mousedown", handlePointerDown); document.removeEventListener("keydown", handleEscape); };
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [chatInput]);

  const anyFileProcessing = processingFiles.size > 0;

  const handleSendMessage = useCallback(async (text?: string) => {
    const msgText = text || chatInput.trim();
    if (!msgText || isThinking || isStreaming || anyFileProcessing) return;
    setChatInput("");

    setMessages((prev) => [...prev, { role: "user", content: msgText }]);
    setIsThinking(true);
    setMessages((prev) => [...prev, { role: "assistant", content: "", isStreaming: true }]);

    const { sendChatMessage } = await import("@/lib/api");
    let assistantContent = "";

    await sendChatMessage(
      msgText,
      null,
      project.files.map((file) => file.name).filter((name) => !processingFiles.has(name)),
      (token) => {
        assistantContent += token;
        setIsThinking(false);
        setIsStreaming(true);
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { ...updated[updated.length - 1], content: assistantContent, isStreaming: true };
          return updated;
        });
      },
      (sources) => {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { ...updated[updated.length - 1], sources };
          return updated;
        });
      },
      () => {
        setIsThinking(false);
        setIsStreaming(false);
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { ...updated[updated.length - 1], isStreaming: false };
          return updated;
        });
        onUpdateProject({ ...project, chatCount: project.chatCount + 1, lastActivity: new Date().toLocaleDateString() });
      },
      (error) => {
        setIsThinking(false);
        setIsStreaming(false);
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { ...updated[updated.length - 1], content: `❌ Error: ${error}`, isStreaming: false };
          return updated;
        });
      }
    );
  }, [chatInput, isThinking, isStreaming, anyFileProcessing, project, onUpdateProject, processingFiles]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
  };

  // Upload files and poll until ingestion completes
  const uploadAndPoll = useCallback(async (files: File[], currentProject: Project) => {
    const { uploadDocument, getDocuments } = await import("@/lib/api");

    const newFiles = files.map((f) => ({
      name: f.name,
      size: f.size < 1024 ? `${f.size} B` : f.size < 1048576 ? `${(f.size / 1024).toFixed(1)} KB` : `${(f.size / 1048576).toFixed(1)} MB`,
    }));

    // Add files immediately with processing label
    const processingEntries = newFiles.map((f) => ({ name: f.name, size: "⏳ Processing..." }));
    onUpdateProject({ ...currentProject, files: [...currentProject.files, ...processingEntries], docCount: currentProject.docCount + newFiles.length });
    setProcessingFiles((prev) => new Set([...prev, ...files.map((f) => f.name)]));

    for (const file of files) {
      try {
        const doc = await uploadDocument(file);

        // Poll until completed or failed (max ~3 min, 3s interval)
        let attempts = 0;
        while (attempts < 60) {
          await new Promise((r) => setTimeout(r, 3000));
          try {
            const docs = await getDocuments();
            const found = docs.find((d) => d.id === doc.id);
            if (found?.status === "completed" || found?.status === "failed") break;
          } catch { /* continue polling */ }
          attempts++;
        }

        // Replace "Processing..." with real file size
        const realSize = newFiles.find((nf) => nf.name === file.name)?.size ?? "";
        onUpdateProject((prev: Project) => ({
          ...prev,
          files: prev.files.map((f) =>
            f.name === file.name && f.size === "⏳ Processing..." ? { ...f, size: realSize } : f
          ),
        }));
      } catch {
        onUpdateProject((prev: Project) => ({
          ...prev,
          files: prev.files.map((f) =>
            f.name === file.name && f.size === "⏳ Processing..." ? { ...f, size: "❌ Failed" } : f
          ),
        }));
      } finally {
        setProcessingFiles((prev) => {
          const next = new Set(prev);
          next.delete(file.name);
          return next;
        });
      }
    }
  }, [onUpdateProject]);

  const handleAddFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) await uploadAndPoll(Array.from(e.target.files), project);
    e.target.value = "";
  };

  const handleChatFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) await uploadAndPoll(Array.from(e.target.files), project);
    e.target.value = "";
    setMenuOpen(false);
  };

  const handleSaveInstructions = () => { onUpdateProject({ ...project, instructions }); setShowInstructionsInput(false); };

  const handleRemoveFile = (index: number) => {
    const updated = [...project.files];
    updated.splice(index, 1);
    onUpdateProject({ ...project, files: updated, docCount: Math.max(0, project.docCount - 1) });
  };

  const isProcessing = isThinking || isStreaming;
  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto w-full" style={{ padding: "24px 40px" }}>

        {/* Back link */}
        <button onClick={onBack} className="flex items-center gap-1.5 text-[13px] text-slate-400 hover:text-white transition-colors" style={{ marginBottom: 16 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          All projects
        </button>

        {/* Title + actions */}
        <div className="flex items-center gap-3" style={{ marginBottom: 28 }}>
          <h1 className="text-[22px] font-bold text-white">{project.name}</h1>
          <div className="flex items-center gap-1 ml-auto" ref={optionsRef}>
            <div className="relative">
              <button onClick={() => { setOptionsMenuOpen(!optionsMenuOpen); setConfirmDelete(false); }}
                className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white transition-colors" title="More options">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
                </svg>
              </button>
              <AnimatePresence>
                {optionsMenuOpen && (
                  <motion.div initial={{ opacity: 0, y: -4, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.96 }}
                    transition={{ duration: 0.12 }} className="absolute right-0 top-full z-50 rounded-xl"
                    style={{ marginTop: 4, width: 200, background: "rgba(18,18,32,0.98)", border: "1px solid rgba(255,255,255,0.10)", backdropFilter: "blur(20px)", boxShadow: "0 12px 40px rgba(0,0,0,0.5)", padding: 6 }}>
                    <button onClick={() => { setMessages([]); setOptionsMenuOpen(false); }}
                      className="flex w-full items-center gap-2.5 rounded-lg text-[13px] text-slate-300 hover:bg-white/5 hover:text-white transition-colors" style={{ padding: "8px 10px" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                      Clear chat
                    </button>
                    <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", margin: "4px 0" }} />
                    {!confirmDelete ? (
                      <button onClick={() => setConfirmDelete(true)}
                        className="flex w-full items-center gap-2.5 rounded-lg text-[13px] text-red-400 hover:bg-red-500/10 transition-colors" style={{ padding: "8px 10px" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                        Delete project
                      </button>
                    ) : (
                      <button onClick={() => { onDeleteProject(project.id); setOptionsMenuOpen(false); }}
                        className="flex w-full items-center gap-2.5 rounded-lg text-[13px] font-medium text-red-300 bg-red-500/15 hover:bg-red-500/25 transition-colors" style={{ padding: "8px 10px" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                        Confirm delete
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button onClick={() => setStarred(!starred)}
              className={`rounded-lg p-2 transition-colors ${starred ? "text-yellow-300 hover:bg-yellow-300/10" : "text-slate-400 hover:bg-white/5 hover:text-yellow-300"}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill={starred ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </button>
          </div>
        </div>

        {/* Two-column layout */}
        <div className="grid gap-6" style={{ gridTemplateColumns: "1fr 340px" }}>

          {/* LEFT: Chat area */}
          <div className="flex flex-col min-h-0" style={{ minHeight: 400 }}>

            {/* Processing banner */}
            <AnimatePresence>
              {anyFileProcessing && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2 rounded-xl text-[12px] text-amber-300"
                  style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)", padding: "8px 12px", marginBottom: 10 }}
                >
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                  Indexing files — chat will unlock once processing completes.
                </motion.div>
              )}
            </AnimatePresence>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto rounded-xl"
              style={{ background: hasMessages ? "rgba(255,255,255,0.01)" : "transparent", border: hasMessages ? "1px solid rgba(255,255,255,0.04)" : "none", padding: hasMessages ? "16px" : "0", marginBottom: 12, maxHeight: 420 }}>
              {!hasMessages ? (
                <div className="rounded-xl text-center" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", padding: "24px 20px" }}>
                  <div style={{ marginBottom: 12 }}>
                    <motion.div animate={{ y: [0, -4, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                      className="inline-flex h-12 w-12 items-center justify-center rounded-2xl"
                      style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.15))" }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-indigo-400">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                    </motion.div>
                  </div>
                  <p className="text-[13px] text-slate-400" style={{ marginBottom: 8 }}>Start a chat to keep conversations organized and re-use project knowledge.</p>
                  <div className="flex flex-wrap justify-center gap-2" style={{ marginTop: 12 }}>
                    {[`Summarize the ${project.name} project`, "What are the key topics?"].map((s, i) => (
                      <button key={i} onClick={() => handleSendMessage(s)}
                        disabled={anyFileProcessing}
                        className="rounded-lg text-[12px] text-indigo-400 hover:bg-indigo-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ padding: "6px 12px", border: "1px solid rgba(99,102,241,0.20)" }}>
                        → {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <AnimatePresence mode="popLayout">
                    {messages.map((msg, idx) => (
                      <motion.div key={idx} initial={{ opacity: 0, y: 10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                        className={`flex items-start gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${msg.role === "user" ? "bg-linear-to-br from-cyan-500 to-blue-600" : "bg-linear-to-br from-indigo-500 to-purple-600"}`}>
                          <span className="text-[10px] font-bold text-white">{msg.role === "user" ? "U" : "AI"}</span>
                        </div>
                        <div className={`max-w-[85%] rounded-xl px-3.5 py-2.5 ${msg.role === "user" ? "rounded-tr-sm" : "rounded-tl-sm"}`}
                          style={{ background: msg.role === "user" ? "rgba(6,182,212,0.08)" : "rgba(99,102,241,0.06)", border: `1px solid ${msg.role === "user" ? "rgba(6,182,212,0.12)" : "rgba(99,102,241,0.10)"}` }}>
                          <p className="text-[13px] text-slate-200 leading-relaxed whitespace-pre-wrap">
                            {msg.content}
                            {msg.isStreaming && <span className="ml-0.5 inline-block h-3.5 w-0.5 bg-indigo-400 align-text-bottom animate-pulse" />}
                          </p>
                          {msg.sources && msg.sources.length > 0 && <SourcesCollapsible sources={msg.sources} />}
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  {isThinking && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-indigo-500 to-purple-600">
                        <span className="text-[10px] font-bold text-white">AI</span>
                      </div>
                      <div className="rounded-xl rounded-tl-sm px-3.5 py-2.5" style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.10)" }}>
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                            <span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                            <span className="h-1.5 w-1.5 rounded-full bg-pink-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                          </div>
                          <span className="text-[11px] text-slate-500">Thinking...</span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>
              )}
            </div>

            {/* Chat input */}
            <div className="relative rounded-xl" style={{ border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.02)" }}>
              <input ref={chatFileInputRef} type="file" multiple accept=".pdf,.docx,.doc,.xlsx,.xls,.csv" className="hidden" onChange={handleChatFileUpload} />
              <div style={{ padding: "12px 16px 6px" }}>
                <textarea ref={textareaRef} value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={handleKeyDown}
                  placeholder={anyFileProcessing ? "Waiting for files to finish indexing..." : isProcessing ? "AI is generating..." : "How can I help with this project?"}
                  disabled={isProcessing || anyFileProcessing} rows={1}
                  className="w-full resize-none bg-transparent text-[13px] text-white outline-none placeholder:text-slate-500 leading-relaxed" style={{ maxHeight: 120 }} />
              </div>
              <div className="flex items-center justify-between" style={{ padding: "6px 12px 10px" }}>
                <div className="relative">
                  <button ref={attachButtonRef} onClick={() => setMenuOpen(!menuOpen)}
                    className={`rounded-lg p-1.5 transition-colors ${menuOpen ? "bg-indigo-500/20 text-indigo-300" : "text-slate-500 hover:bg-white/5 hover:text-slate-300"}`}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                  <AnimatePresence>
                    {menuOpen && (
                      <motion.div ref={attachmentMenuRef} initial={{ opacity: 0, y: 6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.97 }}
                        transition={{ duration: 0.12 }} className="absolute bottom-full left-0 z-30 rounded-xl"
                        style={{ marginBottom: 6, width: 220, background: "rgba(18,18,32,0.98)", border: "1px solid rgba(255,255,255,0.10)", backdropFilter: "blur(20px)", boxShadow: "0 12px 40px rgba(0,0,0,0.5)", padding: 5 }}>
                        <button onClick={() => { chatFileInputRef.current?.click(); setMenuOpen(false); }}
                          className="flex w-full items-center gap-2.5 rounded-lg text-[12px] text-slate-300 hover:bg-white/5 hover:text-white transition-colors" style={{ padding: "8px 10px" }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a5.5 5.5 0 0 1-7.78-7.78l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95l-9.2 9.19a1.5 1.5 0 0 1-2.12-2.12l8.49-8.48" /></svg>
                          Add files
                        </button>
                        <button onClick={() => { setChatInput((p) => p.trim() ? `Think step by step:\n${p}` : "Think step by step: "); setMenuOpen(false); textareaRef.current?.focus(); }}
                          className="flex w-full items-center gap-2.5 rounded-lg text-[12px] text-slate-300 hover:bg-white/5 hover:text-white transition-colors" style={{ padding: "8px 10px" }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.8-2 2.3-2 4" /><circle cx="12" cy="12" r="10" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                          Thinking
                        </button>
                        <button onClick={() => { setChatInput((p) => p.trim() ? `Do deep research on: ${p}` : "Do deep research on: "); setMenuOpen(false); textareaRef.current?.focus(); }}
                          className="flex w-full items-center gap-2.5 rounded-lg text-[12px] text-slate-300 hover:bg-white/5 hover:text-white transition-colors" style={{ padding: "8px 10px" }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                          Deep research
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => handleSendMessage()}
                  disabled={isProcessing || anyFileProcessing || !chatInput.trim()}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-white transition-all disabled:opacity-30"
                  style={{ background: chatInput.trim() && !isProcessing && !anyFileProcessing ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : "rgba(99,102,241,0.2)" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </motion.button>
              </div>
            </div>

            {project.description && (
              <div style={{ marginTop: 16 }}>
                <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold" style={{ marginBottom: 6 }}>Description</p>
                <p className="text-[13px] text-slate-400" style={{ lineHeight: "1.6" }}>{project.description}</p>
              </div>
            )}
          </div>

          {/* RIGHT: Instructions + Files */}
          <div className="flex flex-col gap-0">
            {/* Instructions */}
            <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 16, marginBottom: 16 }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                <h3 className="text-[14px] font-semibold text-indigo-400">Instructions</h3>
                <button onClick={() => setShowInstructionsInput(!showInstructionsInput)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-white/5 hover:text-white transition-colors">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              </div>
              {showInstructionsInput ? (
                <div>
                  <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)}
                    placeholder="Add instructions to tailor the AI's responses..." rows={4}
                    className="w-full resize-none text-[12px] text-white outline-none placeholder:text-slate-500"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "10px 12px", lineHeight: "1.6" }}
                    autoFocus />
                  <div className="flex gap-2 justify-end" style={{ marginTop: 8 }}>
                    <button onClick={() => { setInstructions(project.instructions); setShowInstructionsInput(false); }} className="text-[11px] text-slate-400 hover:text-white px-3 py-1.5 rounded-md hover:bg-white/5">Cancel</button>
                    <button onClick={handleSaveInstructions} className="text-[11px] text-white px-3 py-1.5 rounded-md" style={{ background: "rgba(99,102,241,0.3)" }}>Save</button>
                  </div>
                </div>
              ) : (
                <p className="text-[12px] text-slate-500">{project.instructions || "Add instructions to tailor the AI's responses"}</p>
              )}
            </div>

            {/* Files */}
            <div>
              <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
                <h3 className="text-[14px] font-semibold text-indigo-400">Files</h3>
                <button onClick={() => fileInputRef.current?.click()} className="rounded-lg p-1 text-slate-400 hover:bg-white/5 hover:text-white transition-colors">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
                <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleAddFile} />
              </div>
              {project.files.length === 0 ? (
                <div onClick={() => fileInputRef.current?.click()}
                  className="cursor-pointer rounded-xl flex flex-col items-center justify-center transition-colors hover:bg-white/3"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", padding: "32px 20px" }}>
                  <div className="flex items-end gap-1" style={{ marginBottom: 14 }}>
                    <div className="rounded" style={{ width: 28, height: 34, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }} />
                    <div className="rounded" style={{ width: 28, height: 38, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", marginLeft: -8 }} />
                    <div className="rounded" style={{ width: 28, height: 30, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", marginLeft: -8 }} />
                  </div>
                  <p className="text-[12px] text-slate-400 text-center" style={{ lineHeight: "1.6" }}>Add PDFs, documents, or other text to reference in this project.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {project.files.map((f, i) => {
                    const isFileProcessing = f.size === "⏳ Processing...";
                    const isFailed = f.size === "❌ Failed";
                    return (
                      <div key={i} className="group flex items-center gap-2.5 rounded-lg hover:bg-white/3 transition-colors" style={{ padding: "8px 10px" }}>
                        <div className="flex shrink-0 items-center justify-center rounded"
                          style={{ width: 28, height: 28, background: isFileProcessing ? "rgba(251,191,36,0.10)" : isFailed ? "rgba(239,68,68,0.10)" : "rgba(99,102,241,0.10)" }}>
                          {isFileProcessing ? (
                            <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400 animate-pulse" />
                          ) : isFailed ? (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                          ) : (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-indigo-400"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] text-white truncate">{f.name}</p>
                          <p className={`text-[10px] ${isFileProcessing ? "text-amber-400" : isFailed ? "text-red-400" : "text-slate-500"}`}>
                            {f.size}
                          </p>
                        </div>
                        {!isFileProcessing && (
                          <button onClick={() => handleRemoveFile(i)}
                            className="shrink-0 rounded p-1 text-slate-500 opacity-0 transition-all group-hover:opacity-100 hover:bg-white/10 hover:text-red-400">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                          </button>
                        )}
                      </div>
                    );
                  })}
                  <button onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 rounded-lg text-[12px] text-slate-400 hover:bg-white/5 hover:text-white transition-colors"
                    style={{ padding: "8px 10px", marginTop: 4 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    Add more files
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Main ──────────────────────────────────────────────────────────── */

export default function ProjectsModule() {
  const { projects, setProjects, selectedProjectId, setSelectedProjectId } = useApp();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"activity" | "name">("activity");
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Listen for sidebar's "New project" button
  useEffect(() => {
    const handler = () => setShowCreateModal(true);
    window.addEventListener('open-create-project', handler);
    return () => window.removeEventListener('open-create-project', handler);
  }, []);

  const selectedProject = selectedProjectId ? projects.find((p) => p.id === selectedProjectId) ?? null : null;

  const handleCreateProject = (name: string, desc: string) => {
    const newProject: Project = {
      id: Date.now().toString(),
      name,
      description: desc,
      lastActivity: new Date().toLocaleDateString(),
      chatCount: 0,
      docCount: 0,
      instructions: "",
      files: [],
    };
    setProjects((prev) => [newProject, ...prev]);
    setShowCreateModal(false);
    setSelectedProjectId(newProject.id);
  };

  // Supports both direct updates and functional updates (for polling)
  const handleUpdateProject = (updated: Project | ((prev: Project) => Project)) => {
    if (typeof updated === "function") {
      setProjects((prev) =>
        prev.map((p) => (p.id === selectedProjectId ? updated(p) : p))
      );
    } else {
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    }
  };

  const handleDeleteProject = (id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setSelectedProjectId(null);
  };

  if (selectedProject) {
    return (
      <ProjectDetailView
        project={selectedProject}
        onBack={() => setSelectedProjectId(null)}
        onUpdateProject={handleUpdateProject}
        onDeleteProject={handleDeleteProject}
      />
    );
  }

  const filtered = projects.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const sorted = [...filtered].sort((a, b) => sortBy === "name" ? a.name.localeCompare(b.name) : b.lastActivity.localeCompare(a.lastActivity));

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto w-full" style={{ padding: "28px 40px" }}>
        <div className="w-full">
          <div className="flex items-center justify-between" style={{ marginBottom: 20 }}>
            <h1 className="text-[20px] font-bold text-white">Projects</h1>
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 rounded-lg text-[13px] font-medium text-white"
              style={{ padding: "8px 16px", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", borderRadius: 8 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              New project
            </motion.button>
          </div>

          <div className="flex items-center gap-3" style={{ marginBottom: 20 }}>
            <div className="relative flex-1">
              <span className="pointer-events-none absolute flex items-center text-slate-500" style={{ left: 12, top: "50%", transform: "translateY(-50%)" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              </span>
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search projects..."
                className="w-full text-[13px] text-white outline-none placeholder:text-slate-500"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 10, padding: "10px 12px 10px 38px" }} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500">Sort by</span>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as "activity" | "name")}
                className="appearance-none cursor-pointer text-[12px] text-slate-300 outline-none"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 8, padding: "6px 10px" }}>
                <option value="activity" style={{ background: "#1a1a2e" }}>Activity</option>
                <option value="name" style={{ background: "#1a1a2e" }}>Name</option>
              </select>
            </div>
          </div>

          {sorted.length === 0 && !searchQuery ? (
            <div className="flex flex-col items-center justify-center" style={{ paddingTop: 80 }}>
              <div style={{ marginBottom: 24 }}>
                <div className="flex items-end gap-1">
                  <div className="rounded-lg" style={{ width: 40, height: 40, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }} />
                  <div className="rounded-lg" style={{ width: 40, height: 48, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", marginLeft: -12, marginBottom: 4 }} />
                  <div className="rounded-lg flex items-center justify-center" style={{ width: 36, height: 36, background: "rgba(99,102,241,0.10)", border: "1px solid rgba(99,102,241,0.20)", marginLeft: -8, marginBottom: 8 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-indigo-400"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                  </div>
                </div>
              </div>
              <h2 className="text-[16px] font-semibold text-white" style={{ marginBottom: 8 }}>Looking to start a project?</h2>
              <p className="text-[13px] text-slate-400 text-center" style={{ maxWidth: 360, marginBottom: 20, lineHeight: "1.6" }}>Upload materials, set custom instructions, and organize conversations in one space.</p>
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 rounded-lg text-[13px] font-medium text-white"
                style={{ padding: "9px 20px", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                New project
              </motion.button>
            </div>
          ) : sorted.length === 0 && searchQuery ? (
            <div className="flex flex-col items-center justify-center" style={{ paddingTop: 60 }}>
              <p className="text-[13px] text-slate-500">No projects matching &ldquo;{searchQuery}&rdquo;</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {sorted.map((project) => (
                <motion.div key={project.id} whileHover={{ y: -2 }} onClick={() => setSelectedProjectId(project.id)}
                  className="rounded-xl cursor-pointer transition-colors hover:bg-white/4"
                  style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)", padding: "18px 20px" }}>
                  <div className="flex items-start gap-3" style={{ marginBottom: 10 }}>
                    <div className="flex shrink-0 items-center justify-center rounded-lg" style={{ width: 36, height: 36, background: "rgba(99,102,241,0.12)" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-indigo-400"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-medium text-white truncate">{project.name}</p>
                      <p className="text-[12px] text-slate-500 truncate" style={{ marginTop: 2 }}>{project.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-[11px] text-slate-500">
                    <span>{project.chatCount} chats</span>
                    <span>{project.docCount} docs</span>
                    <span className="ml-auto">{project.lastActivity}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showCreateModal && (
          <CreateProjectModal onClose={() => setShowCreateModal(false)} onCreate={handleCreateProject} />
        )}
      </AnimatePresence>
    </div>
  );
}