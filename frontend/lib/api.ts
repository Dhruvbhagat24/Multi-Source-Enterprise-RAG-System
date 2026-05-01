/**
 * API Service Layer
 * Central module for all backend communication.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const REQUEST_TIMEOUT_MS = 6000;
const CHAT_STREAM_TIMEOUT_MS = 0;
const RETRY_DELAYS_MS = [200, 600, 1200];

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" ||
      error.name === "TimeoutError" ||
      /timeout/i.test(error.message))
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getApiBaseCandidates(): string[] {
  const normalized = API_BASE.replace(/\/$/, "");
  const candidates = [normalized];

  // Browser networking can intermittently fail on localhost resolution changes.
  if (normalized.includes("localhost")) {
    candidates.push(normalized.replace("localhost", "127.0.0.1"));
  }

  return Array.from(new Set(candidates));
}

async function fetchWithRetry(
  path: string,
  init?: RequestInit,
  options?: { timeoutMs?: number; retries?: number }
): Promise<Response> {
  const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const retries = options?.retries ?? RETRY_DELAYS_MS.length;
  const bases = getApiBaseCandidates();

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    for (const base of bases) {
      const controller = new AbortController();
      const useTimeout = timeoutMs > 0;
      const timer = useTimeout
        ? setTimeout(() => controller.abort(new DOMException("Request timeout", "TimeoutError")), timeoutMs)
        : null;

      try {
        const response = await fetch(`${base}${path}`, {
          ...init,
          signal: controller.signal,
        });
        if (timer) clearTimeout(timer);
        return response;
      } catch (error) {
        if (timer) clearTimeout(timer);
        lastError = error;
      }
    }

    if (attempt < retries) {
      await sleep(RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Network request failed after retries");
}

// ─── Types ──────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  isStreaming?: boolean;
  resolved_project_files?: string[];
  resolved_project_mode?: "query" | "session" | string;
  is_cached?: boolean;
}

export interface Source {
  id: number;
  content: string;
  metadata: Record<string, string>;
}

export interface ChatSession {
  id: string;
  title: string;
  message_count: number;
}

export interface DocumentItem {
  id: string;
  filename: string;
  size: number;
  status: "processing" | "completed" | "failed";
  type: string;
  error?: string;
}

export interface SyncedProject {
  id: string;
  name: string;
  description: string;
  lastActivity: string;
  chatCount: number;
  docCount: number;
  instructions: string;
  files: { name: string; size: string; addedAt?: string }[];
  chats: {
    id: string;
    title: string;
    messages: { role: string; content: string; sources?: Source[] }[];
    createdAt: string;
  }[];
}

export interface SystemHealth {
  status: string;
  components: {
    llm: { status: string; provider: string; model: string };
    embeddings: { status: string; provider: string; model: string };
    vector_store: { status: string; type: string };
  };
}

export interface Settings {
  llm: { provider: string; model: string };
  embeddings: { provider: string; model: string };
  available_providers: { llm: string[]; embeddings: string[] };
  available_models: Record<string, string[]>;
}

export interface BackendCapabilities {
  endpoints: Record<string, boolean>;
  modules: {
    chat: boolean;
    documents: boolean;
    settings: boolean;
  };
  features: {
    streamingChat: boolean;
    ragSources: boolean;
    documentUpload: boolean;
    documentStatusTracking: boolean;
    providerSwitching: boolean;
    modelSelection: boolean;
  };
  providers: {
    llm: string[];
    embeddings: string[];
  };
}

// ─── Chat API ───────────────────────────────────────────────────────

export async function sendChatMessage(
  message: string,
  sessionId: string | null,
  userId: string,
  projectFiles: string[] | null,
  onToken: (token: string) => void,
  onSources: (sources: Source[]) => void,
  onDone: (sessionId: string) => void,
  onError: (error: string) => void,
  onSelection?: (files: string[], mode?: string) => void
): Promise<void> {
  try {
    const response = await fetchWithRetry(`/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        user_id: userId,
        session_id: sessionId,
        project_files: projectFiles && projectFiles.length > 0 ? projectFiles : null,
      }),
    }, { timeoutMs: CHAT_STREAM_TIMEOUT_MS, retries: 0 });

    if (!response.ok) throw new Error("Chat request failed");

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            switch (data.type) {
              case "token":
                onToken(data.data);
                break;
              case "sources":
                onSources(data.data);
                break;
              case "selection": {
                const files = Array.isArray(data.data?.files) ? data.data.files : [];
                const mode = typeof data.data?.mode === "string" ? data.data.mode : undefined;
                onSelection?.(files, mode);
                break;
              }
              case "done":
                onDone(data.data);
                break;
              case "error":
                onError(data.data);
                break;
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    }
  } catch (error) {
    if (isTimeoutError(error)) {
      onError("The response timed out. Please check that Ollama is running (ollama serve), then retry. If the issue persists, try a lighter model.");
      return;
    }
    onError(error instanceof Error ? error.message : "Unknown error");
  }
}

export async function getChatSessions(userId: string): Promise<ChatSession[]> {
  const res = await fetchWithRetry(`/api/chat/sessions?user_id=${encodeURIComponent(userId)}`, undefined, { retries: 1 });
  const data = await res.json();
  return data.sessions || [];
}

export async function getChatSession(
  sessionId: string,
  userId: string
): Promise<ChatMessage[]> {
  try {
    const res = await fetchWithRetry(`/api/chat/sessions/${sessionId}?user_id=${encodeURIComponent(userId)}`);
    const data = await res.json();
    return data.messages || [];
  } catch {
    return [];
  }
}

export async function deleteChatSession(sessionId: string, userId: string): Promise<void> {
  await fetchWithRetry(`/api/chat/sessions/${sessionId}?user_id=${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
}

// ─── Documents API ──────────────────────────────────────────────────

export async function uploadDocument(file: File, userId: string): Promise<DocumentItem> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("user_id", userId);

  const res = await fetchWithRetry(`/api/documents/upload`, {
    method: "POST",
    body: formData,
  }, { timeoutMs: 120000, retries: 0 });

  if (!res.ok) throw new Error("Upload failed");
  const data = await res.json();
  return data.document;
}

export async function getDocuments(userId: string): Promise<DocumentItem[]> {
  const res = await fetchWithRetry(`/api/documents?user_id=${encodeURIComponent(userId)}`, undefined, { retries: 1 });
  if (!res.ok) throw new Error("Failed to load documents");
  const data = await res.json();
  return data.documents || [];
}

export async function getDocumentStatus(docId: string): Promise<{ doc_id: string; status: string }> {
  const res = await fetchWithRetry(`/api/documents/status/${docId}`, undefined, { retries: 1 });
  if (!res.ok) throw new Error("Failed to load document status");
  return res.json();
}

export async function deleteDocument(docId: string, userId: string): Promise<void> {
  await fetchWithRetry(`/api/documents/${docId}?user_id=${encodeURIComponent(userId)}`, { method: "DELETE" });
}

// ─── Projects Sync API ──────────────────────────────────────────────

export async function getProjects(userId: string): Promise<SyncedProject[]> {
  const res = await fetchWithRetry(`/api/projects?user_id=${encodeURIComponent(userId)}`, undefined, { retries: 1 });
  if (!res.ok) throw new Error("Failed to load projects");
  const data = await res.json();
  return Array.isArray(data.projects) ? data.projects : [];
}

export async function syncProjects(userId: string, projects: SyncedProject[]): Promise<void> {
  const res = await fetchWithRetry(`/api/projects`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, projects }),
  }, { timeoutMs: 10000, retries: 1 });

  if (!res.ok) throw new Error("Failed to sync projects");
}

// ─── Settings API ───────────────────────────────────────────────────

export async function getSettings(): Promise<Settings> {
  const res = await fetchWithRetry(`/api/settings`, undefined, { retries: 1 });
  return res.json();
}

export async function updateSettings(
  settings: Partial<{
    llm_provider: string;
    llm_model: string;
    embeddings_provider: string;
    embeddings_model: string;
  }>
): Promise<void> {
  await fetchWithRetry(`/api/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
}

// ─── Health API ─────────────────────────────────────────────────────

export async function getSystemHealth(): Promise<SystemHealth> {
  const res = await fetchWithRetry(`/api/health`, undefined, { retries: 1 });
  return res.json();
}

// ─── Backend Capability Discovery ───────────────────────────────────

async function checkEndpoint(path: string): Promise<boolean> {
  try {
    const res = await fetchWithRetry(path, undefined, { retries: 0, timeoutMs: 2500 });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getBackendCapabilities(): Promise<BackendCapabilities> {
  const [
    healthOk,
    sessionsOk,
    docsOk,
    settingsData,
  ] = await Promise.all([
    checkEndpoint("/api/health"),
    checkEndpoint("/api/chat/sessions"),
    checkEndpoint("/api/documents"),
    getSettings().catch(() => null),
  ]);

  const chatOk = sessionsOk;
  const settingsOk = settingsData !== null;

  const providers = {
    llm: settingsData?.available_providers?.llm || [],
    embeddings: settingsData?.available_providers?.embeddings || [],
  };

  const modules = {
    chat: chatOk,
    documents: docsOk,
    settings: settingsOk,
  };

  return {
    endpoints: {
      health: healthOk,
      chat: chatOk,
      chatSessions: sessionsOk,
      documents: docsOk,
      settings: settingsOk,
    },
    modules,
    features: {
      streamingChat: modules.chat,
      ragSources: modules.chat,
      documentUpload: modules.documents,
      documentStatusTracking: modules.documents,
      providerSwitching: modules.settings,
      modelSelection:
        providers.llm.length > 0 || providers.embeddings.length > 0,
    },
    providers,
  };
}
