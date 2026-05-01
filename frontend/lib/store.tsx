"use client";

import { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import {
  getProjects,
  syncProjects,
  type ChatMessage,
  type Source,
  type ChatSession,
  type BackendCapabilities,
  type SyncedProject,
} from "@/lib/api";

// ─── Project chat type ──────────────────────────────────────────────
export interface ProjectChat {
  id: string;
  title: string;
  messages: { role: string; content: string; sources?: import("@/lib/api").Source[] }[];
  createdAt: string;
}

// ─── Project type (shared across sidebar + ProjectsModule) ──────────
export interface Project {
  id: string;
  name: string;
  description: string;
  lastActivity: string;
  chatCount: number;
  docCount: number;
  instructions: string;
  files: { name: string; size: string; addedAt?: string }[];
  chats: ProjectChat[];
}

// ─── AI State for 3D visualization ─────────────────────────────────
export type AIState = "idle" | "listening" | "thinking" | "streaming" | "done";

// ─── Module type ────────────────────────────────────────────────────
export type ModuleType = "chat" | "documents" | "settings" | "projects";

// ─── Context Types ──────────────────────────────────────────────────
interface AppContextType {
  // Sidebar
  sidebarOpen: boolean;
  toggleSidebar: () => void;

  // Module navigation
  activeModule: ModuleType;
  setActiveModule: (module: ModuleType) => void;

  // AI state (for 3D visualization)
  aiState: AIState;
  setAIState: (state: AIState) => void;

  // Chat
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  addMessage: (message: ChatMessage) => void;
  currentSessionId: string | null;
  setCurrentSessionId: (id: string | null) => void;
  sessions: ChatSession[];
  setSessions: React.Dispatch<React.SetStateAction<ChatSession[]>>;
  currentSources: Source[];
  setCurrentSources: (sources: Source[]) => void;

  // Projects (shared between sidebar & ProjectsModule)
  projects: Project[];
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;

  // Upload queue (shared across modules)
  pendingUploads: string[];
  setPendingUploads: React.Dispatch<React.SetStateAction<string[]>>;

  // Backend feature map
  capabilities: BackendCapabilities | null;
  setCapabilities: (capabilities: BackendCapabilities | null) => void;

  // User identity
  userId: string | undefined;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const CHAT_UI_STORAGE_KEY = "neural-console-chat-ui-v1";
const PROJECTS_STORAGE_KEY = "neural-console-projects-v1";

type PersistedChatUI = {
  messages: ChatMessage[];
  currentSessionId: string | null;
  currentSources: Source[];
};

type PersistedProjectsState = {
  projects: Project[];
  selectedProjectId: string | null;
};

function loadPersistedChatUI(): PersistedChatUI | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(CHAT_UI_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<PersistedChatUI>;
    return {
      messages: Array.isArray(parsed.messages) ? (parsed.messages as ChatMessage[]) : [],
      currentSessionId:
        typeof parsed.currentSessionId === "string" ? parsed.currentSessionId : null,
      currentSources: Array.isArray(parsed.currentSources)
        ? (parsed.currentSources as Source[])
        : [],
    };
  } catch {
    return null;
  }
}

function loadPersistedProjectsState(): PersistedProjectsState | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<PersistedProjectsState>;
    return {
      projects: Array.isArray(parsed.projects) ? (parsed.projects as Project[]) : [],
      selectedProjectId:
        typeof parsed.selectedProjectId === "string" ? parsed.selectedProjectId : null,
    };
  } catch {
    return null;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const userId = (session?.user as any)?.id as string | undefined;

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeModule, setActiveModule] = useState<ModuleType>("chat");
  const [aiState, setAIState] = useState<AIState>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSources, setCurrentSources] = useState<Source[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const resolvedSelectedProjectId =
    selectedProjectId && projects.some((p) => p.id === selectedProjectId)
      ? selectedProjectId
      : null;
  const initialPersistedProjectsRef = useRef<Project[]>([]);
  const hasLoadedProjectsFromBackendRef = useRef(false);
  const isHydratingProjectsRef = useRef(false);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasHydratedLocalStateRef = useRef(false);
  const [pendingUploads, setPendingUploads] = useState<string[]>([]);
  const [capabilities, setCapabilities] = useState<BackendCapabilities | null>(null);

  useEffect(() => {
    // Only restore projects on startup.
    // Chat always starts fresh (new chat) on page load / login.
    const persistedProjects = loadPersistedProjectsState();

    if (persistedProjects) {
      initialPersistedProjectsRef.current = persistedProjects.projects;
      setProjects(persistedProjects.projects);
      setSelectedProjectId(persistedProjects.selectedProjectId);
    }

    hasHydratedLocalStateRef.current = true;
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const addMessage = useCallback((message: ChatMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  useEffect(() => {
    if (!hasHydratedLocalStateRef.current) return;

    try {
      window.localStorage.setItem(
        CHAT_UI_STORAGE_KEY,
        JSON.stringify({
          messages,
          currentSessionId,
          currentSources,
        } satisfies PersistedChatUI)
      );
    } catch {
      // Ignore storage errors to avoid interrupting chat flow.
    }
  }, [messages, currentSessionId, currentSources]);

  useEffect(() => {
    if (!hasHydratedLocalStateRef.current) return;

    try {
      window.localStorage.setItem(
        PROJECTS_STORAGE_KEY,
        JSON.stringify({
          projects,
          selectedProjectId: resolvedSelectedProjectId,
        } satisfies PersistedProjectsState)
      );
    } catch {
      // Ignore storage errors to avoid interrupting project flow.
    }
  }, [projects, resolvedSelectedProjectId]);

  useEffect(() => {
    if (!hasHydratedLocalStateRef.current || !userId) return;

    let canceled = false;

    const hydrateProjectsFromBackend = async () => {
      try {
        const remoteProjects = await getProjects(userId);
        if (canceled) return;

        if (remoteProjects.length > 0) {
          isHydratingProjectsRef.current = true;
          setProjects(remoteProjects as Project[]);
          queueMicrotask(() => {
            isHydratingProjectsRef.current = false;
          });
        } else if (initialPersistedProjectsRef.current.length > 0) {
          // Seed backend once from local cache for first-time sync enablement.
          await syncProjects(userId, initialPersistedProjectsRef.current as SyncedProject[]);
        }
      } catch {
        // Keep local projects when backend is unavailable.
      } finally {
        hasLoadedProjectsFromBackendRef.current = true;
      }
    };

    void hydrateProjectsFromBackend();

    return () => {
      canceled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!hasLoadedProjectsFromBackendRef.current || !userId) return;
    if (isHydratingProjectsRef.current) return;

    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }

    syncTimerRef.current = setTimeout(() => {
      void syncProjects(userId, projects as SyncedProject[]).catch(() => {
        // Keep UI responsive even if backend sync temporarily fails.
      });
    }, 600);

    return () => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    };
  }, [projects, userId]);

  return (
    <AppContext.Provider
      value={{
        sidebarOpen,
        toggleSidebar,
        activeModule,
        setActiveModule,
        aiState,
        setAIState,
        messages,
        setMessages,
        addMessage,
        currentSessionId,
        setCurrentSessionId,
        sessions,
        setSessions,
        currentSources,
        setCurrentSources,
        projects,
        setProjects,
        selectedProjectId: resolvedSelectedProjectId,
        setSelectedProjectId,
        pendingUploads,
        setPendingUploads,
        capabilities,
        setCapabilities,
        userId,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
}
