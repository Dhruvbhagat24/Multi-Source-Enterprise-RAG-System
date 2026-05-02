"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession, signOut } from "next-auth/react";
import { useApp, type ModuleType } from "@/lib/store";
import { getChatSessions, deleteChatSession } from "@/lib/api";

// ─── Icons ──────────────────────────────────────────────────────────

const icons = {
  chat: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  documents: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  plus: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  collapse: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
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
  settings: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  ),
  help: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  info: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
  logout: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  chevronUp: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  ),
  search: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  projects: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
};

const navItems: { id: ModuleType; label: string; icon: keyof typeof icons }[] = [
  { id: "chat", label: "Chat", icon: "chat" },
  { id: "documents", label: "Documents", icon: "documents" },
];

export default function Sidebar({
  availableModules,
}: {
  availableModules: Record<ModuleType, boolean>;
}) {
  const { data: session } = useSession();
  const userEmail = session?.user?.email || "";
  const userName = session?.user?.name || userEmail.split("@")[0] || "User";
  const userInitials = userName
    .split(/\s+/)
    .map((w: string) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "U";
  const [isHydrated, setIsHydrated] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const [projectMenuId, setProjectMenuId] = useState<string | null>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const projectMenuRef = useRef<HTMLDivElement>(null);

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
    projects,
    setProjects,
    selectedProjectId,
    setSelectedProjectId,
    userId,
  } = useApp();

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  // Close profile menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close search on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
        setSearchQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close project menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (projectMenuRef.current && !projectMenuRef.current.contains(e.target as Node)) {
        setProjectMenuId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Auto-focus search input when opened
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const closeOnMobile = () => {
    if (isMobile && sidebarOpen) toggleSidebar();
  };

  useEffect(() => {
    if (!userId) return;
    const loadSessions = async () => {
      try {
        const data = await getChatSessions(userId);
        setSessions(data);
      } catch { /* keep existing */ }
    };
    loadSessions();
  }, [setSessions, userId]);

  const handleNewChat = () => {
    setCurrentSessionId(null);
    setMessages([]);
    setCurrentSources([]);
    setActiveModule("chat");
    closeOnMobile();
  };

  const handleSelectSession = async (sessionId: string) => {
    setCurrentSessionId(sessionId);
    setActiveModule("chat");
    if (!userId) return;
    const { getChatSession } = await import("@/lib/api");
    const messages = await getChatSession(sessionId, userId);
    setMessages(messages);
    closeOnMobile();
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (!userId) return;
    await deleteChatSession(sessionId, userId);
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    if (currentSessionId === sessionId) {
      setCurrentSessionId(null);
      setMessages([]);
    }
  };

  const visibleNavItems = navItems.filter((item) => availableModules[item.id]);
  const recentSessions = [...sessions].reverse();
  const showExpanded = isMobile || sidebarOpen;

  return (
    <AnimatePresence mode="wait">
      <motion.aside
        initial={false}
        animate={
          isMobile
            ? { x: sidebarOpen ? 0 : -304, width: 280 }
            : { x: 0, width: sidebarOpen ? 280 : 68 }
        }
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        className="glass-strong fixed inset-y-3 left-3 z-30 flex min-h-0 w-70 shrink-0 flex-col rounded-2xl border border-white/10 md:relative md:inset-auto md:z-20 md:h-full md:w-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between" style={{ padding: '16px 14px 12px' }}>
          <AnimatePresence mode="wait">
            {showExpanded && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-2.5"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-indigo-600">
                  <span className="text-sm font-bold text-white">R</span>
                </div>
                <div>
                  <h1 className="text-[14px] font-semibold text-white leading-tight">Neural Console</h1>
                  <p className="text-[10px] text-slate-500">DocuMind</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <button
            onClick={toggleSidebar}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
            id="sidebar-toggle"
          >
            <motion.div animate={{ rotate: sidebarOpen ? 0 : 180 }} transition={{ duration: 0.3 }}>
              {icons.collapse}
            </motion.div>
          </button>
        </div>

        {/* Top actions: New chat, Search */}
        <div style={{ padding: '0 10px 4px' }}>
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleNewChat}
            className={`flex w-full items-center gap-3 rounded-lg text-[13px] font-medium text-white transition-colors hover:bg-white/5 ${
              !showExpanded ? "justify-center" : ""
            }`}
            style={{ padding: '8px 10px' }}
            id="new-chat-button"
          >
            <span className="text-indigo-400">{icons.plus}</span>
            {showExpanded && <span>New chat</span>}
          </motion.button>

          <div ref={searchRef} className="relative">
            <button
              onClick={() => { setSearchOpen(!searchOpen); setSearchQuery(""); }}
              className={`flex w-full items-center gap-3 rounded-lg text-[13px] transition-colors ${
                searchOpen ? "bg-white/8 text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              } ${!showExpanded ? "justify-center" : ""}`}
              style={{ padding: '8px 10px' }}
              id="nav-search"
            >
              {icons.search}
              {showExpanded && <span>Search</span>}
            </button>

            {/* Search popup */}
            <AnimatePresence>
              {searchOpen && showExpanded && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.97 }}
                  transition={{ duration: 0.12 }}
                  className="absolute left-0 right-0 rounded-xl"
                  style={{
                    top: '100%',
                    marginTop: 4,
                    background: 'rgba(18,18,32,0.98)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    backdropFilter: 'blur(20px)',
                    boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
                    padding: '8px',
                    zIndex: 60,
                    width: 280,
                  }}
                >
                  {/* Search input */}
                  <div className="flex items-center gap-2" style={{ padding: '4px 8px', marginBottom: 4 }}>
                    <span className="text-slate-500">{icons.search}</span>
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search chats..."
                      className="flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-slate-500"
                    />
                    <button
                      onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
                      className="rounded p-0.5 text-slate-500 transition-colors hover:text-slate-300"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>

                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', margin: '0 0 4px' }} />

                  {/* Results */}
                  <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                    {(() => {
                      const filtered = [...sessions].reverse().filter((s) =>
                        s.title.toLowerCase().includes(searchQuery.toLowerCase())
                      );
                      if (filtered.length === 0) {
                        return (
                          <p className="text-[12px] text-slate-500" style={{ padding: '12px 8px', textAlign: 'center' }}>
                            {searchQuery ? "No matching chats" : "Type to search your chats"}
                          </p>
                        );
                      }
                      return filtered.map((session) => (
                        <button
                          key={session.id}
                          onClick={() => {
                            handleSelectSession(session.id);
                            setSearchOpen(false);
                            setSearchQuery("");
                          }}
                          className="flex w-full items-center gap-2.5 rounded-lg text-[13px] text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
                          style={{ padding: '7px 8px' }}
                        >
                          <span className="text-slate-500">{icons.chat}</span>
                          <span className="flex-1 truncate text-left">{session.title}</span>
                        </button>
                      ));
                    })()}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Divider */}
        <div style={{ margin: '4px 14px', borderTop: '1px solid rgba(255,255,255,0.06)' }} />

        {/* Main nav: Chat, Documents */}
        <div style={{ padding: '4px 10px' }}>
          {visibleNavItems.map((item) => (
            <motion.button
              key={item.id}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                setActiveModule(item.id);
                closeOnMobile();
              }}
              className={`flex w-full items-center gap-3 rounded-lg text-[13px] transition-colors ${
                activeModule === item.id
                  ? "bg-white/8 font-medium text-white"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              } ${!showExpanded ? "justify-center" : ""}`}
              style={{ padding: '8px 10px' }}
              id={`nav-${item.id}`}
            >
              <span className={activeModule === item.id ? "text-indigo-400" : ""}>
                {icons[item.icon]}
              </span>
              {showExpanded && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {item.label}
                </motion.span>
              )}
            </motion.button>
          ))}
        </div>

        {/* Divider before projects */}
        {showExpanded && <div style={{ margin: '4px 14px', borderTop: '1px solid rgba(255,255,255,0.06)' }} />}

        {/* Projects section (ChatGPT style) */}
        {showExpanded && (
          <div style={{ padding: '4px 10px' }}>
            {/* Projects header with chevron */}
            <button
              onClick={() => setProjectsExpanded(!projectsExpanded)}
              className="flex w-full items-center gap-2 rounded-lg text-[12px] font-medium text-slate-500 transition-colors hover:text-slate-300"
              style={{ padding: '6px 10px', marginBottom: 2 }}
            >
              <motion.svg
                animate={{ rotate: projectsExpanded ? 0 : -90 }}
                transition={{ duration: 0.2 }}
                width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </motion.svg>
              <span>Projects</span>
            </button>

            <AnimatePresence>
              {projectsExpanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{ overflow: 'hidden' }}
                >
                  {/* New project button */}
                  <button
                    onClick={() => {
                      setActiveModule('projects');
                      setSelectedProjectId(null);
                      closeOnMobile();
                      // Trigger create modal via a custom event
                      window.dispatchEvent(new CustomEvent('open-create-project'));
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg text-[13px] text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
                    style={{ padding: '7px 10px' }}
                    id="sidebar-new-project"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      <line x1="12" y1="11" x2="12" y2="17" />
                      <line x1="9" y1="14" x2="15" y2="14" />
                    </svg>
                    <span>New project</span>
                  </button>

                  {/* Project list */}
                  {(isHydrated ? projects : []).map((project) => (
                    <div key={project.id} className="relative">
                      <button
                        onClick={() => {
                          setSelectedProjectId(project.id);
                          setActiveModule('projects');
                          closeOnMobile();
                        }}
                        className={`group flex w-full items-center justify-between rounded-lg text-[13px] transition-all ${
                          activeModule === 'projects' && selectedProjectId === project.id
                            ? 'bg-white/8 text-white'
                            : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-300'
                        }`}
                        style={{ padding: '7px 10px' }}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                          </svg>
                          <span className="truncate">{project.name}</span>
                        </div>
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            setProjectMenuId(projectMenuId === project.id ? null : project.id);
                          }}
                          className="ml-1 shrink-0 rounded p-1 opacity-0 transition-all hover:bg-white/10 group-hover:opacity-60"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="5" r="1" />
                            <circle cx="12" cy="12" r="1" />
                            <circle cx="12" cy="19" r="1" />
                          </svg>
                        </span>
                      </button>

                      {/* Project context menu */}
                      <AnimatePresence>
                        {projectMenuId === project.id && (
                          <motion.div
                            ref={projectMenuRef}
                            initial={{ opacity: 0, y: -4, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -4, scale: 0.96 }}
                            transition={{ duration: 0.12 }}
                            className="absolute right-0 z-50 rounded-xl"
                            style={{
                              top: '100%',
                              marginTop: 2,
                              width: 180,
                              background: 'rgba(18,18,32,0.98)',
                              border: '1px solid rgba(255,255,255,0.10)',
                              backdropFilter: 'blur(20px)',
                              boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
                              padding: 5,
                            }}
                          >
                            <button
                              onClick={() => {
                                setSelectedProjectId(project.id);
                                setActiveModule('projects');
                                setProjectMenuId(null);
                                closeOnMobile();
                              }}
                              className="flex w-full items-center gap-2.5 rounded-lg text-[12px] text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
                              style={{ padding: '7px 10px' }}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                              </svg>
                              Open project
                            </button>
                            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', margin: '3px 0' }} />
                            <button
                              onClick={() => {
                                setProjects((prev) => prev.filter((p) => p.id !== project.id));
                                if (selectedProjectId === project.id) setSelectedProjectId(null);
                                setProjectMenuId(null);
                              }}
                              className="flex w-full items-center gap-2.5 rounded-lg text-[12px] text-red-400 hover:bg-red-500/10 transition-colors"
                              style={{ padding: '7px 10px' }}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                              Delete
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Collapsed sidebar: just show the projects icon */}
        {!showExpanded && (
          <div style={{ padding: '4px 10px' }}>
            <button
              onClick={() => {
                setActiveModule('projects');
                closeOnMobile();
              }}
              className={`flex w-full items-center justify-center gap-3 rounded-lg text-[13px] transition-colors ${
                activeModule === 'projects'
                  ? 'bg-white/8 font-medium text-white'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
              style={{ padding: '8px 10px' }}
              id="nav-projects-collapsed"
            >
              <span className={activeModule === 'projects' ? 'text-indigo-400' : ''}>{icons.projects}</span>
            </button>
          </div>
        )}

        {/* Spacer */}
        <div style={{ height: '12px' }} />

        {/* Recent chats */}
        {showExpanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <p className="text-[11px] font-medium text-slate-500" style={{ padding: '0 20px 8px' }}>
              Recents
            </p>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" style={{ padding: '0 10px' }}>
              {recentSessions.length === 0 ? (
                <p className="text-[12px] text-slate-600" style={{ padding: '8px 10px' }}>
                  No conversations yet
                </p>
              ) : (
                recentSessions.map((session) => (
                  <motion.button
                    key={session.id}
                    whileHover={{ x: 1 }}
                    onClick={() => handleSelectSession(session.id)}
                    className={`group flex w-full items-center justify-between rounded-lg text-[13px] transition-all ${
                      currentSessionId === session.id
                        ? "bg-white/8 text-white"
                        : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-300"
                    }`}
                    style={{ padding: '7px 10px' }}
                  >
                    <span className="flex-1 truncate text-left">{session.title}</span>
                    <span
                      onClick={(e) => handleDeleteSession(e, session.id)}
                      className="ml-2 shrink-0 rounded p-1 opacity-0 transition-all hover:bg-white/10 hover:text-red-400 group-hover:opacity-60"
                    >
                      {icons.trash}
                    </span>
                  </motion.button>
                ))
              )}
            </div>
          </motion.div>
        )}

        {/* Footer with profile menu */}
        {showExpanded && (
          <div ref={profileRef} className="relative" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '12px 14px' }}>

            {/* Profile menu popup */}
            <AnimatePresence>
              {profileMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-3 right-3 rounded-xl"
                  style={{
                    bottom: '100%',
                    marginBottom: 8,
                    background: 'rgba(20,20,35,0.98)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    backdropFilter: 'blur(20px)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                    padding: '6px',
                    zIndex: 50,
                  }}
                >
                  {/* Email / identifier */}
                  <div style={{ padding: '8px 10px 6px', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 4 }}>
                    <p className="text-[11px] text-slate-400 truncate">{userEmail}</p>
                  </div>

                  {/* Menu items - Group 1 */}
                  <button
                    onClick={() => {
                      setActiveModule("settings");
                      setProfileMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-lg text-[13px] text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
                    style={{ padding: '8px 10px' }}
                  >
                    {icons.settings}
                    <span>Settings</span>
                  </button>

                  <button
                    className="flex w-full items-center gap-3 rounded-lg text-[13px] text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
                    style={{ padding: '8px 10px' }}
                  >
                    {icons.help}
                    <span>Get help</span>
                  </button>

                  {/* Divider */}
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', margin: '4px 0' }} />

                  {/* Group 2 */}
                  <button
                    className="flex w-full items-center gap-3 rounded-lg text-[13px] text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
                    style={{ padding: '8px 10px' }}
                  >
                    {icons.info}
                    <span>About</span>
                  </button>

                  <button
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="flex w-full items-center gap-3 rounded-lg text-[13px] text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-400"
                    style={{ padding: '8px 10px' }}
                  >
                    {icons.logout}
                    <span>Log out</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Profile button */}
            <button
              onClick={() => setProfileMenuOpen(!profileMenuOpen)}
              className="flex w-full items-center gap-2.5 rounded-lg transition-colors hover:bg-white/5"
              style={{ padding: '4px 2px' }}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-indigo-600">
                <span className="text-[11px] font-bold text-white">{userInitials}</span>
              </div>
              <div className="min-w-0 flex-1 text-left">
                <p className="text-[13px] font-medium text-white truncate">{userName}</p>
                <p className="text-[10px] text-slate-500 truncate">{userEmail}</p>
              </div>
              <motion.span
                animate={{ rotate: profileMenuOpen ? 0 : 180 }}
                transition={{ duration: 0.2 }}
                className="text-slate-500"
              >
                {icons.chevronUp}
              </motion.span>
            </button>
          </div>
        )}
      </motion.aside>
    </AnimatePresence>
  );
}
