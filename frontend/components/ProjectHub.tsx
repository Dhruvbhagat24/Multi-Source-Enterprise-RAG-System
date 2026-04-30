"use client";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Project } from "@/lib/store";

function getFileIcon(ext: string) {
  if (ext === "pdf") return { color: "text-red-400", bg: "rgba(248,113,113,0.10)" };
  if (["doc","docx"].includes(ext)) return { color: "text-blue-400", bg: "rgba(96,165,250,0.10)" };
  if (["xls","xlsx","csv"].includes(ext)) return { color: "text-emerald-400", bg: "rgba(52,211,153,0.10)" };
  return { color: "text-indigo-400", bg: "rgba(99,102,241,0.10)" };
}

type ProjectHubProps = {
  project: Project;
  userId: string | undefined;
  onBack: () => void;
  onUpdateProject: (u: Project | ((p: Project) => Project)) => void;
  onDeleteProject: (id: string) => void;
  onOpenChat: (chatId: string) => void;
  onOpenChatComposer: () => void;
};

export default function ProjectHub({ project, userId, onBack, onUpdateProject, onDeleteProject, onOpenChat, onOpenChatComposer }: ProjectHubProps) {
  const [activeTab, setActiveTab] = useState<"chats"|"sources">("chats");
  const [showInstructions, setShowInstructions] = useState(false);
  const [instructions, setInstructions] = useState(project.instructions);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const optRef = useRef<HTMLDivElement>(null);
  const instrRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (optRef.current && !optRef.current.contains(target)) {
        setOptionsOpen(false);
        setConfirmDel(false);
      }
      if (instrRef.current && !instrRef.current.contains(target)) {
        setShowInstructions(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOptionsOpen(false);
        setConfirmDel(false);
        setShowInstructions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const uploadAndPoll = async (files: File[]) => {
    const { uploadDocument, getDocuments } = await import("@/lib/api");
    const meta = files.map(f => ({ name: f.name, size: f.size < 1024 ? `${f.size} B` : f.size < 1048576 ? `${(f.size/1024).toFixed(1)} KB` : `${(f.size/1048576).toFixed(1)} MB`, addedAt: new Date().toLocaleDateString() }));
    const entries = meta.map(f => ({ name: f.name, size: "⏳ Processing...", addedAt: f.addedAt }));
    onUpdateProject(p => ({ ...p, files: [...p.files, ...entries], docCount: p.docCount + files.length }));
    for (const file of files) {
      try {
        if (!userId) return;
        const doc = await uploadDocument(file, userId);
        let att = 0;
        while (att < 60) { await new Promise(r => setTimeout(r, 3000)); try { const ds = await getDocuments(userId); const fd = ds.find(d => d.id === doc.id); if (fd?.status === "completed" || fd?.status === "failed") break; } catch {} att++; }
        const rs = meta.find(m => m.name === file.name)?.size ?? "";
        onUpdateProject(p => ({ ...p, files: p.files.map(f => f.name === file.name && f.size === "⏳ Processing..." ? { ...f, size: rs } : f) }));
      } catch {
        onUpdateProject(p => ({ ...p, files: p.files.map(f => f.name === file.name && f.size === "⏳ Processing..." ? { ...f, size: "❌ Failed" } : f) }));
      }
    }
  };

  const handleAddFile = async (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files) await uploadAndPoll(Array.from(e.target.files)); e.target.value = ""; };
  const handleRemoveFile = (i: number) => { const u = [...project.files]; u.splice(i, 1); onUpdateProject({ ...project, files: u, docCount: Math.max(0, project.docCount - 1) }); };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col items-center">
      <div className="flex-1 min-h-0 overflow-y-auto w-full max-w-230" style={{ padding: "32px 20px 32px" }}>
        <button onClick={onBack} className="flex items-center gap-1.5 text-[13px] text-slate-400 hover:text-white transition-colors" style={{ marginBottom: 24 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
          All projects
        </button>

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3" style={{ marginBottom: 24 }}>
          <div className="min-w-0 flex items-center gap-3">
            <div className="flex shrink-0 items-center justify-center rounded-xl" style={{ width: 44, height: 44, background: "rgba(99,102,241,0.12)" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-indigo-400"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
            </div>
            <h1 className="truncate text-[26px] font-bold text-white tracking-tight">{project.name}</h1>
          </div>
          <div className="flex items-center gap-1">
            <div ref={instrRef} className="relative">
              <button onClick={() => setShowInstructions(!showInstructions)} className={`rounded-lg p-2.5 transition-colors ${showInstructions ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"}`} title="Instructions">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
              </button>
              <AnimatePresence>
                {showInstructions && (
                  <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="absolute right-0 top-full z-50 rounded-xl"
                    style={{ marginTop: 6, width: 320, background: "rgba(18,18,32,0.98)", border: "1px solid rgba(255,255,255,0.10)", backdropFilter: "blur(20px)", boxShadow: "0 12px 40px rgba(0,0,0,0.5)", padding: 12 }}>
                    <h4 className="text-[13px] font-semibold text-white mb-2">Project Instructions</h4>
                    <textarea value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Add instructions..." rows={4}
                      className="w-full resize-none text-[12px] text-white outline-none placeholder:text-slate-500" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "10px 12px" }} autoFocus />
                    <div className="flex gap-2 justify-end mt-2">
                      <button onClick={() => { setInstructions(project.instructions); setShowInstructions(false); }} className="text-[11px] text-slate-400 hover:text-white px-3 py-1.5 rounded-md hover:bg-white/5">Cancel</button>
                      <button onClick={() => { onUpdateProject({ ...project, instructions }); setShowInstructions(false); }} className="text-[11px] text-white px-3 py-1.5 rounded-md" style={{ background: "rgba(99,102,241,0.3)" }}>Save</button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div ref={optRef} className="relative">
              <button onClick={() => { setOptionsOpen(!optionsOpen); setConfirmDel(false); }} className="rounded-lg p-2.5 text-slate-400 hover:bg-white/5 hover:text-white transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></svg>
              </button>
              <AnimatePresence>
                {optionsOpen && (
                  <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="absolute right-0 top-full z-50 rounded-xl"
                    style={{ marginTop: 6, width: 200, background: "rgba(18,18,32,0.98)", border: "1px solid rgba(255,255,255,0.10)", backdropFilter: "blur(20px)", boxShadow: "0 12px 40px rgba(0,0,0,0.5)", padding: 6 }}>
                    {!confirmDel ? (
                      <button onClick={() => setConfirmDel(true)} className="flex w-full items-center gap-2.5 rounded-lg text-[13px] text-red-400 hover:bg-red-500/10 transition-colors" style={{ padding: "8px 10px" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                        Delete project
                      </button>
                    ) : (
                      <button onClick={() => { onDeleteProject(project.id); setOptionsOpen(false); }} className="flex w-full items-center gap-2.5 rounded-lg text-[13px] font-medium text-red-300 bg-red-500/15 hover:bg-red-500/25 transition-colors" style={{ padding: "8px 10px" }}>Confirm delete</button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Search / chat launcher */}
        <motion.button
          type="button"
          onClick={onOpenChatComposer}
          whileHover={{ y: -2, scale: 1.01 }}
          whileTap={{ scale: 0.985 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="search-launcher group mb-4 flex w-full flex-col items-start gap-3 rounded-2xl text-left sm:flex-row sm:items-center"
          style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.03))", border: "1px solid rgba(255,255,255,0.12)", padding: "16px 18px", boxShadow: "0 12px 36px rgba(0,0,0,0.22)" }}
        >
          <div className="search-launcher-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-indigo-200"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="search-launcher-title text-[16px] font-semibold text-slate-300 transition-colors group-hover:text-white">Search here</p>
            <p className="mt-1 text-[13px] text-slate-500">Tap to open a full-screen chat for {project.name}</p>
          </div>
          <div className="flex w-full items-center justify-end gap-2 text-[11px] text-slate-500 sm:w-auto">
            <span className="hidden sm:inline">Press to chat</span>
            <span className="search-launcher-key rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.22em] text-slate-400">Enter</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="transition-transform duration-300 group-hover:translate-x-1"><path d="M9 18l6-6-6-6" /></svg>
          </div>
        </motion.button>

        {/* Tabs */}
        <div className="relative z-10 mb-6 mt-6 flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-slate-950/50 p-1.5 backdrop-blur-sm">
            {(["chats","sources"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`rounded-lg px-5 py-2.5 text-[13px] font-semibold transition-all ${activeTab === tab ? "bg-white/14 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.1)]" : "text-slate-400 hover:text-white hover:bg-white/8"}`}
              >
                {tab === "chats" ? "Chats" : "Sources"}
              </button>
            ))}
          </div>
          {activeTab === "sources" && (
            <div className="flex items-center gap-3 text-[11px] text-slate-500">
              <span>Newest ∨</span>
              <span>All ∨</span>
            </div>
          )}
        </div>

        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 24 }}>
          <input ref={fileRef} type="file" multiple className="hidden" onChange={handleAddFile} />

          {activeTab === "sources" && (
            <div>
              <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 rounded-lg text-[13px] text-white mb-4" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", padding: "8px 16px" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                Add sources
              </button>
              {project.files.length === 0 ? (
                <div className="text-center py-16 text-slate-500 text-[13px]">No sources added yet. Click &quot;Add sources&quot; to upload files.</div>
              ) : (
                <div className="flex flex-col gap-2" style={{ position: "relative", zIndex: 10 }}>
                  {project.files.map((f, i) => {
                    const pr = f.size === "⏳ Processing..."; const fl = f.size === "❌ Failed";
                    const ext = f.name.split('.').pop()?.toLowerCase() || '';
                    const ic = getFileIcon(ext);
                    return (
                      <div key={i} className="group flex items-center gap-3 rounded-xl border border-transparent p-3 transition-colors hover:border-white/8 hover:bg-white/4">
                        <div className="flex shrink-0 items-center justify-center rounded-lg w-10 h-10" style={{ background: pr ? "rgba(251,191,36,0.10)" : fl ? "rgba(239,68,68,0.10)" : ic.bg }}>
                          {pr ? <span className="h-2.5 w-2.5 rounded-full bg-amber-400 animate-pulse" /> : fl ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg> : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={ic.color}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium text-white truncate">{f.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-[11px] uppercase tracking-wide font-semibold ${ic.color}`}>{ext || 'FILE'}</span>
                            <span className="text-[11px] text-slate-600">·</span>
                            <span className={`text-[11px] ${pr ? "text-amber-400" : fl ? "text-red-400" : "text-slate-500"}`}>{f.size}</span>
                            {f.addedAt && <><span className="text-[11px] text-slate-600">·</span><span className="text-[11px] text-slate-500">{f.addedAt}</span></>}
                          </div>
                        </div>
                        {!pr && <button onClick={() => handleRemoveFile(i)} className="shrink-0 rounded-lg p-2 text-slate-500 opacity-0 group-hover:opacity-100 hover:bg-white/10 hover:text-red-400 transition-all">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === "chats" && (
            <div>
              {(!project.chats || project.chats.length === 0) ? (
                <div className="text-center py-16 text-slate-500 text-[13px]">No chats yet. Start a new conversation above.</div>
              ) : (
                <div className="flex flex-col gap-2" style={{ position: "relative", zIndex: 10 }}>
                  {project.chats.map(chat => (
                    <div key={chat.id} onClick={() => onOpenChat(chat.id)}
                      className="group flex items-center gap-3 rounded-xl border border-transparent p-4 transition-all hover:border-white/8 hover:bg-white/4 cursor-pointer">
                      <div className="flex shrink-0 items-center justify-center rounded-lg w-10 h-10" style={{ background: "rgba(99,102,241,0.10)" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-indigo-400"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[14px] font-medium text-white truncate">{chat.title}</h3>
                        <p className="text-[11px] text-slate-500 mt-0.5">{chat.messages.length} messages</p>
                      </div>
                      <span className="shrink-0 min-w-22 text-right text-[11px] text-slate-500">{chat.createdAt}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
