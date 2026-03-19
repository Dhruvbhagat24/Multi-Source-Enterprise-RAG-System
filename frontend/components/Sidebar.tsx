"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useApp, type ModuleType } from "@/lib/store";
import { getChatSessions, deleteChatSession } from "@/lib/api";

// ─── Icons (inline SVG for zero dependencies) ──────────────────────

const icons = {
  chat: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  documents: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  settings: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  ),
  plus: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  collapse: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  ),
  trash: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
};

const navItems: { id: ModuleType; label: string; icon: keyof typeof icons }[] = [
  { id: "chat", label: "Chat", icon: "chat" },
  { id: "documents", label: "Documents", icon: "documents" },
  { id: "settings", label: "Settings", icon: "settings" },
];

export default function Sidebar({
  availableModules,
}: {
  availableModules: Record<ModuleType, boolean>;
}) {
  const {
    sidebarOpen,
    toggleSidebar,
    activeModule,
    setActiveModule,
    sessions,
    setSessions,
    currentSessionId,
    setCurrentSessionId,
    setMessages,
    setCurrentSources,
  } = useApp();

  // Load sessions on mount
  useEffect(() => {
    const loadSessions = async () => {
      try {
        const data = await getChatSessions();
        setSessions(data);
      } catch {
        // Keep existing sidebar sessions if session endpoint is temporarily unavailable.
      }
    };
    loadSessions();
  }, [setSessions]);

  const handleNewChat = () => {
    setCurrentSessionId(null);
    setMessages([]);
    setCurrentSources([]);
    setActiveModule("chat");
  };

  const handleSelectSession = async (sessionId: string) => {
    setCurrentSessionId(sessionId);
    setActiveModule("chat");
    // Load session messages
    const { getChatSession } = await import("@/lib/api");
    const messages = await getChatSession(sessionId);
    setMessages(messages);
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    await deleteChatSession(sessionId);
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    if (currentSessionId === sessionId) {
      setCurrentSessionId(null);
      setMessages([]);
    }
  };

  const visibleNavItems = navItems.filter((item) => availableModules[item.id]);
  const recentSessions = [...sessions].reverse();

  return (
    <AnimatePresence mode="wait">
      <motion.aside
        initial={{ width: 280 }}
        animate={{ width: sidebarOpen ? 280 : 68 }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        className="h-screen flex flex-col glass-strong relative z-20 shrink-0 border-r border-cyan-400/15 py-2"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-3 border-b border-white/5">
          <AnimatePresence mode="wait">
            {sidebarOpen && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-3"
              >
                <div className="w-8 h-8 rounded-lg bg-linear-to-br from-cyan-500 to-indigo-600 flex items-center justify-center shadow-glow">
                  <span className="text-white text-sm font-bold">R</span>
                </div>
                <div>
                  <h1 className="text-sm font-semibold text-white">Neural Console</h1>
                  <p className="text-[10px] text-slate-400">Enterprise RAG</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <button
            onClick={toggleSidebar}
            className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-all duration-200"
            id="sidebar-toggle"
          >
            <motion.div
              animate={{ rotate: sidebarOpen ? 0 : 180 }}
              transition={{ duration: 0.3 }}
            >
              {icons.collapse}
            </motion.div>
          </button>
        </div>

        {/* New Chat Button */}
        <div className="px-3 py-3">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleNewChat}
            className={`w-full min-h-11 flex items-center gap-3 px-3 py-2.5 rounded-xl bg-linear-to-r from-cyan-500/80 to-indigo-600/80 hover:from-cyan-400 hover:to-indigo-500 text-white text-sm font-medium transition-all duration-200 shadow-glow ${
              !sidebarOpen ? "justify-center" : ""
            }`}
            id="new-chat-button"
          >
            {icons.plus}
            {sidebarOpen && <span>New Chat</span>}
          </motion.button>
        </div>

        {/* Navigation */}
        <nav className="px-3 pt-1 space-y-2">
          {visibleNavItems.map((item) => (
            <motion.button
              key={item.id}
              whileHover={{ x: 2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setActiveModule(item.id)}
              className={`w-full min-h-11 flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 ${
                activeModule === item.id
                    ? "bg-cyan-400/10 text-white shadow-inner-glow border border-cyan-400/20"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              } ${!sidebarOpen ? "justify-center" : ""}`}
              id={`nav-${item.id}`}
            >
              <span className={activeModule === item.id ? "text-indigo-400" : ""}>
                {icons[item.icon]}
              </span>
              {sidebarOpen && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {item.label}
                </motion.span>
              )}
            </motion.button>
          ))}
        </nav>

        {/* Divider */}
        <div className="mx-4 my-3 border-t border-white/5" />

        {sidebarOpen && (
          <div className="px-4 pb-3">
            <div className="glass rounded-xl px-3 py-2 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.15em] text-slate-500">AI Core</span>
              <span className="text-[10px] text-cyan-300">Live</span>
            </div>
          </div>
        )}

        {/* Chat History */}
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex-1 overflow-y-auto px-3 pb-3 space-y-2"
          >
            <p className="text-[11px] text-slate-500 uppercase tracking-wider px-3 mb-2 font-medium">
              Recent Chats
            </p>
            {recentSessions.length === 0 ? (
              <p className="text-xs text-slate-600 px-3 py-2">No conversations yet</p>
            ) : (
              recentSessions.map((session) => (
                <motion.button
                  key={session.id}
                  whileHover={{ x: 2 }}
                  onClick={() => handleSelectSession(session.id)}
                  className={`w-full min-h-10 flex items-center justify-between px-3 py-2.5 rounded-lg text-xs transition-all duration-200 group ${
                    currentSessionId === session.id
                      ? "bg-cyan-400/10 text-white border border-cyan-400/20"
                      : "text-slate-400 hover:bg-white/5 hover:text-slate-300"
                  }`}
                >
                  <span className="truncate flex-1 text-left leading-5">{session.title}</span>
                  <span
                    onClick={(e) => handleDeleteSession(e, session.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-all"
                  >
                    {icons.trash}
                  </span>
                </motion.button>
              ))
            )}
          </motion.div>
        )}

        {/* Footer */}
        {sidebarOpen && (
          <div className="p-4 border-t border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-linear-to-br from-cyan-500 to-indigo-600 flex items-center justify-center">
                <span className="text-white text-xs font-bold">D</span>
              </div>
              <div>
                <p className="text-xs text-white font-medium">Dhruv</p>
                <p className="text-[10px] text-slate-500">Admin</p>
              </div>
            </div>
          </div>
        )}
      </motion.aside>
    </AnimatePresence>
  );
}
