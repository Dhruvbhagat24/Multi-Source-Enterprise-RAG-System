"""
FastAPI server wrapping the existing RAG system.
Provides endpoints for chat, document management, and settings.
"""
import os
import json
import uuid
import asyncio
import shutil
import re as _re
from difflib import SequenceMatcher

import hashlib
import secrets
import redis

from typing import Any, List, Optional
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException, Form, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from langchain_core.messages import HumanMessage
import time

from dotenv import load_dotenv
load_dotenv()

# ─── App Setup ───────────────────────────────────────────────────────
app = FastAPI(title="RAG System API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Redis Setup ────────────────────────────────────────────────────────
redis_client = None
try:
    redis_client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)
    redis_client.ping()
    print("[OK] Connected to Redis successfully.")
except Exception as e:
    print(f"[WARN] Redis connection failed: {e}. Falling back to in-memory/JSON storage.")
    redis_client = None

# ─── In-memory stores (would be DB in production) ───────────────────
chat_sessions = {}   # dict of user_id -> dict of session_id -> list of messages
documents_store = [] # list of document metadata dicts
projects_store = {}  # dict of user_id -> list of project payload dicts
users_store = []     # list of user objects { id, email, password_hash, salt }

# ─── Enhancement Stores ───────────────────────────────────────────────
auth_tokens = {}       # dict of token -> user_id
user_doc_versions = {} # dict of user_id -> int
rate_limit_store = {}  # dict of user_id -> list of timestamps

SESSIONS_FILE = Path("./chat_sessions.json")
PROJECTS_FILE = Path("./projects.json")
USERS_FILE = Path("./users.json")

UPLOAD_DIR = Path("./uploads")
UPLOAD_DIR.mkdir(exist_ok=True)
DOCS_DIR = Path("./docs")
DOCS_DIR.mkdir(exist_ok=True)

def load_users():
    global users_store
    if USERS_FILE.exists():
        try:
            with open(USERS_FILE, "r") as f:
                users_store = json.load(f)
        except:
            users_store = []


def save_users():
    with open(USERS_FILE, "w") as f:
        json.dump(users_store, f, indent=2)

def find_user_by_email(email: str) -> Optional[dict]:
    for user in users_store:
        if user["email"] == email:
            return user
    return None


def create_user(email: str, password: str = "") -> dict:
    if find_user_by_email(email):
        raise ValueError("User already exists")

    salt = secrets.token_hex(16)
    password_hash = hash_password(password, salt)

    user = {
        "id": str(uuid.uuid4()),
        "email": email,
        "password_hash": password_hash,
        "salt": salt,
    }

    users_store.append(user)
    save_users()
    return {"id": user["id"], "email": user["email"]}


def validate_user(email: str, password: str) -> Optional[dict]:
    user = find_user_by_email(email)
    if not user:
        return None

    password_hash = hash_password(password, user["salt"])
    if password_hash == user["password_hash"]:
        return {"id": user["id"], "email": user["email"]}
    return None


def get_redis_chat_key(user_id: str, project_id: str, session_id: str) -> str:
    """Generate the Redis key for a chat session."""
    pid = project_id if project_id else "global"
    return f"user:{user_id}:project:{pid}:session:{session_id}"

def load_chat_sessions_from_disk():
    """Load chat history. If Redis is active, it acts as the primary store, but we can fallback."""
    global chat_sessions
    if not SESSIONS_FILE.exists():
        chat_sessions = {}
        return

    try:
        with open(SESSIONS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            chat_sessions = data
        else:
            chat_sessions = {}
    except Exception:
        chat_sessions = {}


def save_chat_sessions_to_disk():
    """Persist chat history. If Redis is active, this is just a backup."""
    try:
        with open(SESSIONS_FILE, "w", encoding="utf-8") as f:
            json.dump(chat_sessions, f, ensure_ascii=False, indent=2)
    except Exception:
        pass

def get_session_messages(user_id: str, project_id: str, session_id: str) -> list:
    """Retrieve messages for a session from Redis (preferred) or memory fallback."""
    if redis_client:
        key = get_redis_chat_key(user_id, project_id, session_id)
        data = redis_client.get(key)
        if data:
            # Refresh TTL on access (30 days)
            redis_client.expire(key, 2592000)
            return json.loads(data)
        return []
    else:
        # Fallback to memory dict
        user_chats = chat_sessions.get(user_id, {})
        return user_chats.get(session_id, [])

def save_session_messages(user_id: str, project_id: str, session_id: str, messages: list):
    """Save messages for a session to Redis (preferred) or memory fallback."""
    if redis_client:
        key = get_redis_chat_key(user_id, project_id, session_id)
        # Store as JSON string with 30-day TTL
        redis_client.setex(key, 2592000, json.dumps(messages))
    else:
        # Fallback to memory dict
        if user_id not in chat_sessions:
            chat_sessions[user_id] = {}
        chat_sessions[user_id][session_id] = messages
        save_chat_sessions_to_disk()


def load_projects_from_disk():
    """Load project data from disk if available."""
    global projects_store
    if not PROJECTS_FILE.exists():
        projects_store = {}
        return

    try:
        with open(PROJECTS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            projects_store = data
        else:
            projects_store = {}
    except Exception:
        # Keep server running even if file is malformed.
        projects_store = {}


def save_projects_to_disk():
    """Persist projects so they survive backend restarts."""
    try:
        with open(PROJECTS_FILE, "w", encoding="utf-8") as f:
            json.dump(projects_store, f, ensure_ascii=False, indent=2)
    except Exception:
        # Persistence failures should not break API responses.
        pass

load_users()
load_chat_sessions_from_disk()
load_projects_from_disk()




def hash_password(password: str, salt: str) -> str:
    """Hash password with salt using PBKDF2."""
    return hashlib.pbkdf2_hmac("sha512", password.encode(), salt.encode(), 100000).hex()





# ─── Lazy-loaded RAG components ─────────────────────────────────────
_vector_store = None
_file_router = None
_llm = None

RAG_TOP_K = int(os.getenv("RAG_TOP_K", "5"))
RAG_CHUNK_CHARS = int(os.getenv("RAG_CHUNK_CHARS", "2000"))
RAG_MAX_CONTEXT_CHARS = int(os.getenv("RAG_MAX_CONTEXT_CHARS", "8000"))
RAG_ALLOW_LLM_FALLBACK = os.getenv("RAG_ALLOW_LLM_FALLBACK", "true").strip().lower() in {"1", "true", "yes", "on"}


def is_documents_intent(message: str) -> bool:
    """Detect requests asking for uploaded/ingested document inventory."""
    text = message.lower()
    intent_phrases = [
        "what documents have been ingested",
        "which documents have been ingested",
        "what files have been ingested",
        "which files have been ingested",
        "list ingested files",
        "list ingested documents",
        "what documents are uploaded",
        "which documents are uploaded",
        "what files are uploaded",
        "which files are uploaded",
        "show uploaded files",
        "show uploaded documents",
    ]

    if any(phrase in text for phrase in intent_phrases):
        return True

    has_doc_word = any(word in text for word in ["document", "documents", "file", "files"])
    has_ingest_word = any(word in text for word in ["ingested", "uploaded", "upload", "ingestion", "ingest", "loaded"])
    has_list_word = any(word in text for word in ["what", "which", "list", "show", "display"])
    return has_doc_word and has_ingest_word and has_list_word


def is_broad_concept_question(message: str) -> bool:
    """Detect broad conceptual questions that benefit from wider retrieval."""
    text = message.strip().lower()
    if not text:
        return False

    starters = [
        "what is",
        "what are",
        "explain",
        "define",
        "tell me about",
        "overview of",
        "summarize",      # ← ADD
        "summarise",      # ← ADD
        "give me a summary",
    ]
    likely_broad = any(text.startswith(s) for s in starters)
    token_count = len([t for t in text.replace("?", " ").split() if t])
    return likely_broad and token_count <= 8


def extract_definition_target(message: str) -> Optional[str]:
    """Extract a likely concept/term from definition-style questions."""
    text = (message or "").strip()
    if not text:
        return None

    lowered = text.lower().strip("?!. ")
    definition_prefixes = [
        "what is ",
        "what are ",
        "who is ",
        "who are ",
        "define ",
        "meaning of ",
        "explain ",
        "explain me ",
        "explain in simple words ",
        "explain in simple language ",
        "tell me about ",
        "help me understand ",
        "i don't understand ",
        "i dont understand ",
        "can you explain ",
        "what do you mean by ",
        "give definition of ",
        "what is the meaning of ",
        "in simple words ",
        "in simple language ",
    ]

    for prefix in definition_prefixes:
        if lowered.startswith(prefix):
            concept = text[len(prefix):].strip(" ?!.,:;\"'")
            # Remove trailing filler words like "like" from casual queries.
            concept = _re.sub(r"\b(like|please|plz)\b\s*$", "", concept, flags=_re.IGNORECASE).strip()
            if concept and len(concept.split()) <= 8:
                return concept

    return None


def build_retrieval_queries(message: str, broad_query: bool) -> List[str]:
    """Expand retrieval query for better term understanding and fuzzy asks."""
    base = (message or "").strip()
    if not base:
        return []

    queries: List[str] = [base]
    concept = extract_definition_target(base)

    if concept:
        queries.extend(
            [
                concept,
                f"{concept} definition",
                f"{concept} meaning",
                f"{concept} explained",
                f"{concept} simple explanation",
                f"{concept} beginner explanation",
                f"explain {concept} from documents",
                f"what is {concept}",
                f"how does {concept} work",
                f"uses of {concept}",
                f"key points of {concept}",
            ]
        )

    if broad_query:
        queries.append(f"{base} in context of uploaded documents")
        queries.append(f"explain this topic from the provided documents: {base}")

    # Additional robust expansions to handle vague/misspelled/short asks.
    normalized = normalize_match_text(base)
    if normalized and normalized != base.lower().strip():
        queries.append(normalized)
    queries.extend(
        [
            f"{base} explained simply",
            f"{base} key idea",
            f"{base} summary",
            f"definition and explanation: {base}",
            f"context from ingested documents about: {base}",
        ]
    )

    # Keep order, remove duplicates.
    seen: set[str] = set()
    unique: List[str] = []
    for q in queries:
        key = q.lower().strip()
        if not key or key in seen:
            continue
        seen.add(key)
        unique.append(q)
    return unique


def generate_fallback_answer_without_sources(user_question: str) -> str:
    """Generate a best-effort general answer when no document context was found."""
    llm = get_llm()
    fallback_prompt = f"""You are an enterprise assistant.

The user asked a question, but no relevant chunks were retrieved from uploaded sources.
Answer helpfully using general knowledge in simple language.
Be explicit that this answer is NOT sourced from the user's documents.
Keep answer concise, practical, and easy to understand.

QUESTION: {user_question}
"""
    result = llm.invoke([HumanMessage(content=fallback_prompt)])
    return result.content if hasattr(result, "content") else str(result)


def dedupe_chunks(chunks: List[Any]) -> List[Any]:
    """Remove duplicate retrieved chunks while preserving order."""
    seen = set()
    unique = []
    for chunk in chunks:
        # Dedupe by content fingerprint only — source_id varies across re-uploads
        key = getattr(chunk, "page_content", "")[:200]
        if key in seen:
            continue
        seen.add(key)
        unique.append(chunk)
    return unique


def normalize_project_files(project_files: Optional[List[str]]) -> List[str]:
    """Normalize project file names for robust source matching."""
    if not project_files:
        return []

    normalized = []
    for name in project_files:
        if not name:
            continue
        clean = Path(str(name)).name.strip().lower()
        if clean:
            normalized.append(clean)
    return normalized


def normalize_match_text(text: str) -> str:
    """Normalize text for lightweight filename/query matching."""
    if not text:
        return ""

    normalized = str(text).lower()
    word_to_num = {
        "zero": "0",
        "one": "1",
        "two": "2",
        "three": "3",
        "four": "4",
        "five": "5",
        "six": "6",
        "seven": "7",
        "eight": "8",
        "nine": "9",
        "ten": "10",
        "eleven": "11",
        "twelve": "12",
    }

    for word, num in word_to_num.items():
        normalized = _re.sub(rf"\b{word}\b", num, normalized)

    normalized = _re.sub(r"[^a-z0-9]+", " ", normalized)
    return _re.sub(r"\s+", " ", normalized).strip()


def tokenize_match_text(text: str) -> set[str]:
    """Tokenize normalized text for overlap scoring."""
    return {t for t in normalize_match_text(text).split() if len(t) >= 2}


def infer_project_files_from_query(query: str, available_filenames: set[str]) -> List[str]:
    """Infer likely target files from prompt text using filename overlap and fuzzy score."""
    if not query or not available_filenames:
        return []

    query_norm = normalize_match_text(query)
    query_tokens = tokenize_match_text(query)
    if not query_norm:
        return []

    scored: list[tuple[float, str]] = []
    for filename in available_filenames:
        base = Path(filename).stem
        base_norm = normalize_match_text(base)
        if not base_norm:
            continue

        score = 0.0
        if base_norm in query_norm:
            score += 6.0

        file_tokens = tokenize_match_text(base)
        overlap = len(query_tokens & file_tokens)
        if overlap:
            score += float(overlap * 2)

        ratio = SequenceMatcher(None, query_norm, base_norm).ratio()
        if ratio >= 0.45:
            score += ratio

        if score > 0:
            scored.append((score, filename))

    if not scored:
        return []

    scored.sort(key=lambda x: x[0], reverse=True)
    best_score = scored[0][0]

    if best_score < 2.0:
        return []

    selected = [name for score, name in scored if score >= best_score - 0.8]
    return selected[:3]


def infer_project_files_from_session(user_id: str, session_id: str) -> List[str]:
    """Fallback to recently used source files in the current chat session."""
    messages = chat_sessions.get(user_id, {}).get(session_id, [])
    if not messages:
        return []

    collected: List[str] = []
    for msg in reversed(messages):
        if msg.get("role") != "assistant":
            continue
        for src in msg.get("sources") or []:
            meta = src.get("metadata") or {}
            source_file = Path(str(meta.get("source_file", ""))).name.strip().lower()
            if source_file and source_file not in collected:
                collected.append(source_file)
        if collected:
            break

    return collected[:3]


def chunk_matches_project_files(chunk: Any, project_files: List[str]) -> bool:
    """Check whether a retrieved chunk belongs to one of the project files."""
    if not project_files:
        return True

    metadata = getattr(chunk, "metadata", {}) or {}
    source_file = str(metadata.get("source_file", "")).strip().lower()
    source_basename = Path(source_file).name
    source_id = str(metadata.get("source_id", "")).strip().lower()

    if not source_basename and not source_id:
        return False

    for filename in project_files:
        if source_basename == filename:
            return True
        if source_basename.endswith(filename):
            return True
        if filename in source_basename:
            return True
        if source_id.endswith(filename):
            return True

    return False


def build_no_project_content_response(project_files: List[str]) -> str:
    """Return a short grounded message when the current project has no indexed content."""
    if not project_files:
        return "I couldn't find any indexed project content to answer from."

    if len(project_files) == 1:
        return f"I couldn't find any indexed content for '{project_files[0]}', so I can't answer this from the current project files."

    listed = ", ".join(project_files[:3])
    suffix = "" if len(project_files) <= 3 else f" and {len(project_files) - 3} more"
    return f"I couldn't find any indexed content for the current project files ({listed}{suffix}), so I can't answer this from the current project files."

def find_user_by_id(user_id: str) -> Optional[dict]:
    for user in users_store:
        if user["id"] == user_id:
            return user
    return None

def is_generic_insufficient_response(text: str) -> bool:
    """Detect generic refusal patterns when context actually exists."""
    t = (text or "").strip().lower()
    patterns = [
        "context does not provide",
        "cannot answer this question from the provided context",
        "insufficient context",
        "not enough context",
    ]
    return any(p in t for p in patterns)


def get_documents_source_mode() -> str:
    return "memory"


def get_documents_inventory(user_id: str):
    user_docs = [d for d in documents_store if d.get("user_id") == user_id]
    return user_docs, "memory", None


def get_active_documents_scope(user_id: str) -> Optional[tuple[set[str], set[str]]]:
    """Return active (completed) document ids and filenames for retrieval filtering.

    Returns None when metadata is unavailable so retrieval can gracefully fall back.
    """
    documents, _, error = get_documents_inventory(user_id)
    if error:
        return None

    active_ids: set[str] = set()
    active_filenames: set[str] = set()

    for d in documents:
        status = str(d.get("status", "")).strip().lower()
        if status != "completed":
            continue

        doc_id = str(d.get("id", "")).strip().lower()
        if doc_id:
            active_ids.add(doc_id)

        filename = Path(str(d.get("filename", ""))).name.strip().lower()
        if filename:
            active_filenames.add(filename)

    return active_ids, active_filenames


def chunk_matches_active_documents(
    chunk: Any,
    active_ids: set[str],
    active_filenames: set[str],
) -> bool:
    """Check whether a retrieved chunk belongs to a currently active document."""
    metadata = getattr(chunk, "metadata", {}) or {}
    source_file = Path(str(metadata.get("source_file", ""))).name.strip().lower()
    source_id = str(metadata.get("source_id", "")).strip().lower()

    if source_id and source_id in active_ids:
        return True
    if source_file and source_file in active_filenames:
        return True
    return False


def delete_vectors_for_document(doc_id: str, filename: Optional[str]) -> Optional[str]:
    """Remove vector chunks that belong to a document id and/or filename."""
    try:
        vs = get_vector_store()
        db = vs.load_or_create()

        if doc_id:
            db.delete(where={"source_id": doc_id})

        if filename:
            clean_name = Path(str(filename)).name.strip()
            if clean_name:
                db.delete(where={"source_file": clean_name})

        return None
    except Exception as e:
        return str(e)


def create_document_record(doc_meta: dict) -> Optional[str]:
    documents_store.append(doc_meta)
    return None


def update_document_status(doc_id: str, status: str, error_message: Optional[str] = None) -> Optional[str]:
    for d in documents_store:
        if d.get("id") == doc_id:
            d["status"] = status
            if error_message:
                d["error"] = error_message
            if status == "completed":
                uid = d.get("user_id")
                if uid:
                    user_doc_versions[uid] = user_doc_versions.get(uid, 0) + 1
            break
    return None



def build_documents_inventory_answer(user_id: str):
    """Create a direct answer and source payload from configured document metadata."""
    documents, source_mode, error = get_documents_inventory(user_id)

    if error:
        return f"I could not read ingested documents from {source_mode}: {error}", []

    if not documents:
        return "No documents have been ingested yet.", []

    lines = [f"{len(documents)} document(s) found:"]
    sources: List[dict] = []

    for idx, doc in enumerate(documents, start=1):
        filename = doc.get("filename", "unknown")
        status = doc.get("status", "unknown")
        size = doc.get("size", 0)
        lines.append(f"{idx}. {filename} (status: {status}, size: {size} bytes)")
        sources.append(
            {
                "id": idx,
                "content": f"{filename} | status={status} | size={size} bytes",
                "metadata": {
                    "source_type": source_mode,
                    "doc_id": doc.get("id", "unknown"),
                    "mime_type": doc.get("type", "unknown"),
                },
            }
        )

    return "\n".join(lines), sources


def get_vector_store():
    global _vector_store
    if _vector_store is None:
        from core.vector_store import VectorStoreManager
        _vector_store = VectorStoreManager(persist_directory="dbv2/chroma_db")
    return _vector_store


def get_file_router():
    global _file_router
    if _file_router is None:
        from core.file_router import FileRouter
        from providers.pdf_ingestor import PDFIngestor
        from providers.docx_ingestor import DocxIngestor
        from providers.sheet_ingestor import SheetIngestor
        _file_router = FileRouter(
            ingestors=[PDFIngestor(), DocxIngestor(), SheetIngestor()]
        )
    return _file_router


def get_llm():
    global _llm
    if _llm is None:
        from core.ai_factory import get_llm as factory_get_llm
        _llm = factory_get_llm("primary")
    return _llm


def format_chat_error(error: Exception) -> str:
    """Convert backend exceptions into user-facing chat errors."""
    message = str(error)
    lower_message = message.lower()
    ollama_base_url = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
    provider = os.getenv("LLM_PRIMARY_PROVIDER", "").strip().lower()

    is_ollama_connection_error = any(
        hint in lower_message
        for hint in [
            "connectionpool(host='127.0.0.1', port=11434)",
            "connectionpool(host='localhost', port=11434)",
            "failed to establish a new connection",
            "connection refused",
            "winerror 10061",
        ]
    )

    if provider == "ollama" and is_ollama_connection_error:
        return (
            f"Ollama is not reachable at {ollama_base_url}. "
            "Start it with `ollama serve`, or switch LLM_PRIMARY_PROVIDER to openai and restart the backend."
        )

    return message


# ─── Pydantic Models ────────────────────────────────────────────────
class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str
    sources: Optional[List[dict]] = None


class ChatRequest(BaseModel):
    message: str
    user_id: str
    session_id: Optional[str] = None
    project_id: Optional[str] = None
    project_files: Optional[List[str]] = None


class SettingsUpdate(BaseModel):
    llm_provider: Optional[str] = None
    llm_model: Optional[str] = None
    embeddings_provider: Optional[str] = None
    embeddings_model: Optional[str] = None


class ProjectsSyncRequest(BaseModel):
    user_id: str
    projects: List[dict]


class AuthRequest(BaseModel):
    email: str
    password: Optional[str] = None


class AuthResponse(BaseModel):
    id: str
    email: str
    token: Optional[str] = None

async def get_optional_user(authorization: Optional[str] = Header(None)):
    """Extract and validate token from Authorization header. Returns user_id if valid, else None."""
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split("Bearer ")[1].strip()
        user_id = auth_tokens.get(token)
        if user_id:
            return user_id
    return None


# ─── Health Check ────────────────────────────────────────────────────
@app.get("/api/health")
async def health_check():
    """Check system health and component status."""
    llm_provider = os.getenv("LLM_PRIMARY_PROVIDER", "unknown")
    llm_model = os.getenv("LLM_PRIMARY_MODEL", "unknown")
    emb_provider = os.getenv("EMBEDDINGS_DEFAULT_PROVIDER", "unknown")
    emb_model = os.getenv("EMBEDDINGS_DEFAULT_MODEL", "unknown")

    # Keep health checks lightweight to avoid blocking UI startup.
    llm_status = "configured" if llm_provider != "unknown" and llm_model != "unknown" else "disconnected"
    embeddings_status = "configured" if emb_provider != "unknown" and emb_model != "unknown" else "disconnected"
    vector_store_status = "configured" if os.path.exists("dbv2/chroma_db") else "disconnected"

    return {
        "status": "operational",
        "components": {
            "llm": {
                "status": llm_status,
                "provider": llm_provider,
                "model": llm_model,
            },
            "embeddings": {
                "status": embeddings_status,
                "provider": emb_provider,
                "model": emb_model,
            },
            "vector_store": {
                "status": vector_store_status,
                "type": "ChromaDB",
            },
        },
    }


# ─── Auth Endpoints ──────────────────────────────────────────────────
@app.post("/api/auth/register", response_model=AuthResponse)
async def register_endpoint(request: AuthRequest):
    if not request.password:
        raise HTTPException(status_code=400, detail="Password required for registration")
    try:
        user = create_user(request.email, request.password)
        token = secrets.token_hex(32)
        auth_tokens[token] = user["id"]
        return AuthResponse(id=user["id"], email=user["email"], token=token)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/auth/login", response_model=AuthResponse)
async def login_endpoint(request: AuthRequest):
    if not request.password:
        raise HTTPException(status_code=400, detail="Password required for login")
    user = validate_user(request.email, request.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    token = secrets.token_hex(32)
    auth_tokens[token] = user["id"]
    return AuthResponse(id=user["id"], email=user["email"], token=token)

@app.post("/api/auth/find-or-create", response_model=AuthResponse)
async def find_or_create_user_endpoint(request: AuthRequest):
    """Find or create user (OAuth flow). Always returns backend-generated UUID."""
    try:
        user = find_user_by_email(request.email)
        if not user:
            user = create_user(request.email, request.password)
        
        # Validate user_id is a valid UUID
        try:
            uuid.UUID(user.get("id"))
        except (ValueError, TypeError):
            raise ValueError(f"Invalid user UUID: {user.get('id')}")
        
        token = secrets.token_hex(32)
        auth_tokens[token] = user.get("id")
        print(f"✅ Auth successful for {request.email}, UUID: {user.get('id')}")
        return AuthResponse(id=user.get("id"), email=user.get("email"), token=token)
    except Exception as e:
        print(f"❌ Error in find_or_create: {e}")
        raise HTTPException(status_code=500, detail=f"Auth error: {str(e)}")

@app.get("/api/auth/me")
async def get_current_user(user_id: str = None, auth_user: Optional[str] = Depends(get_optional_user)):
    final_user_id = auth_user or user_id
    if not final_user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
        
    user = find_user_by_id(final_user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "id": user["id"],
        "email": user["email"]
    } 
    

# ─── Chat Endpoints ─────────────────────────────────────────────────
@app.post("/api/chat")
async def chat(request: ChatRequest, auth_user: Optional[str] = Depends(get_optional_user)):
    """
    Chat endpoint with RAG retrieval.
    Returns a streaming response that sends tokens progressively.
    """
    user_id = auth_user or request.user_id
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    # ─── Rate Limiting ──────────────────────────────────────────────
    now = time.time()
    user_timestamps = rate_limit_store.get(user_id, [])
    user_timestamps = [ts for ts in user_timestamps if now - ts < 60]
    if len(user_timestamps) >= 20:
        raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")
    user_timestamps.append(now)
    rate_limit_store[user_id] = user_timestamps
    session_id = request.session_id or str(uuid.uuid4())
    project_id = request.project_id or ""

    messages = get_session_messages(user_id, project_id, session_id)
    messages.append({
        "role": "user",
        "content": request.message,
    })
    save_session_messages(user_id, project_id, session_id, messages)

    # ─── Smart AI Response Caching ──────────────────────────────
    query_hash = hashlib.sha256(request.message.strip().lower().encode()).hexdigest()
    doc_version = user_doc_versions.get(user_id, 0)
    cache_key = f"cache:{user_id}:{project_id}:{doc_version}:{query_hash}"

    if redis_client:
        cached_response = redis_client.get(cache_key)
        if cached_response:
            cached_data = json.loads(cached_response)
            
            async def generate_cached():
                yield f"data: {json.dumps({'type': 'sources', 'data': cached_data.get('sources', [])})}\n\n"
                
                # Stream the cached answer quickly to simulate typing
                words = cached_data["answer"].split()
                for word in words:
                    yield f"data: {json.dumps({'type': 'token', 'data': word + ' '})}\n\n"
                    await asyncio.sleep(0.01)
                
                messages.append({
                    "role": "assistant",
                    "content": cached_data["answer"],
                    "sources": cached_data.get("sources", []),
                    "is_cached": True
                })
                save_session_messages(user_id, project_id, session_id, messages)
                yield f"data: {json.dumps({'type': 'done', 'data': session_id})}\n\n"
            
            return StreamingResponse(generate_cached(), media_type="text/event-stream")

    async def generate():
        try:
            # Handle document inventory intent directly from metadata store.
            if is_documents_intent(request.message):
                answer, sources = build_documents_inventory_answer(user_id)
                yield f"data: {json.dumps({'type': 'sources', 'data': sources})}\n\n"

                for line in answer.split("\n"):
                    chunk = line + "\n"
                    yield f"data: {json.dumps({'type': 'token', 'data': chunk})}\n\n"
                    await asyncio.sleep(0)

                messages.append({
                    "role": "assistant",
                    "content": answer,
                    "sources": sources,
                })
                save_session_messages(user_id, project_id, session_id, messages)
                
                if redis_client:
                    redis_client.setex(cache_key, 43200, json.dumps({"answer": answer, "sources": sources}))

                yield f"data: {json.dumps({'type': 'done', 'data': session_id})}\n\n"
                return

            # 1) Retrieve relevant chunks
            # 1) Retrieve relevant chunks
            vs = get_vector_store()
            broad_query = is_broad_concept_question(request.message)
            definition_target = extract_definition_target(request.message)
            retrieve_k = max(RAG_TOP_K, 8) if (broad_query or definition_target) else RAG_TOP_K

            active_scope = get_active_documents_scope(user_id)
            active_filenames: set[str] = set()
            if active_scope:
                _, active_filenames = active_scope

            project_files = normalize_project_files(request.project_files)
            auto_selected_files: List[str] = []
            selection_mode: Optional[str] = None
            if not project_files:
                inferred_files = infer_project_files_from_query(request.message, active_filenames)
                if inferred_files:
                    project_files = inferred_files
                    auto_selected_files = inferred_files
                    selection_mode = "query"

            if not project_files:
                session_files = infer_project_files_from_session(user_id, session_id)
                session_selected_files = [f for f in session_files if f in active_filenames]
                if session_selected_files:
                    project_files = session_selected_files
                    auto_selected_files = session_selected_files
                    selection_mode = "session"

            if auto_selected_files:
                yield f"data: {json.dumps({'type': 'selection', 'data': {'files': auto_selected_files, 'mode': selection_mode}})}\n\n"

            if project_files:
                db = vs.load_or_create()
                all_results = db.get(where={"user_id": user_id}, include=["documents", "metadatas"])
                from langchain_core.documents import Document as LCDocument
                chunks = []
                for doc, meta in zip(all_results["documents"], all_results["metadatas"]):
                    meta = meta or {}
                    source_file = Path(str(meta.get("source_file", ""))).name.strip().lower()
                    for pf in project_files:
                        if pf in source_file or source_file.endswith(pf):
                            chunks.append(LCDocument(page_content=doc, metadata=meta))
                            break
            else:
                retriever = vs.as_retriever(
                    search_type="mmr",
                    search_kwargs={
                        "k": retrieve_k,
                        "fetch_k": max(retrieve_k * 2, 12),
                        "lambda_mult": 0.45,
                        "filter": {"user_id": user_id},
                    },
                )
                retrieval_queries = build_retrieval_queries(request.message, broad_query)

                chunks = []
                for q in retrieval_queries:
                    chunks.extend(await asyncio.to_thread(retriever.invoke, q))

            if active_scope:
                active_ids, active_filenames = active_scope
                chunks = [
                    c
                    for c in chunks
                    if chunk_matches_active_documents(c, active_ids, active_filenames)
                ]

            chunks = dedupe_chunks(chunks)

            if not chunks:
                if project_files:
                    answer = build_no_project_content_response(project_files)
                elif RAG_ALLOW_LLM_FALLBACK:
                    try:
                        answer = generate_fallback_answer_without_sources(request.message)
                    except Exception:
                        answer = "I couldn't find relevant source content, and fallback generation is currently unavailable."
                else:
                    answer = "I couldn't find relevant content to answer your question."

                yield f"data: {json.dumps({'type': 'sources', 'data': []})}\n\n"
                yield f"data: {json.dumps({'type': 'token', 'data': answer})}\n\n"
                messages.append({
                    "role": "assistant",
                    "content": answer,
                    "sources": [],
                })
                save_session_messages(user_id, project_id, session_id, messages)
                
                if redis_client:
                    redis_client.setex(cache_key, 43200, json.dumps({"answer": answer, "sources": []}))
                
                yield f"data: {json.dumps({'type': 'done', 'data': session_id})}\n\n"
                return

            chunks = chunks[:retrieve_k]

            sources = []
            for i, chunk in enumerate(chunks):
                sources.append({
                    "id": i + 1,
                    "content": chunk.page_content[:280],
                    "metadata": {
                        k: v for k, v in chunk.metadata.items()
                        if k != "original_content"
                    },
                })

            # Send sources first
            yield f"data: {json.dumps({'type': 'sources', 'data': sources})}\n\n"

            # 2) Build prompt
            context_parts = []
            current_len = 0
            for i, c in enumerate(chunks):
                snippet = c.page_content[:RAG_CHUNK_CHARS]
                section = f"--- Source {i+1} ---\n{snippet}"
                if current_len + len(section) > RAG_MAX_CONTEXT_CHARS:
                    break
                context_parts.append(section)
                current_len += len(section)

            context = "\n\n".join(context_parts)

            prompt = f"""You are a helpful assistant answering questions about uploaded documents.

CONTEXT:
{context}

QUESTION: {request.message}

Instructions:
- Read the context carefully and answer based on what it contains.
- For "what are the key topics" type questions, list the main subjects, themes, and content covered in the document.
- If the user asks for the meaning/definition of a term, start with a simple definition in plain language, then tie it to the retrieved source context.
- Do NOT say topics are "not explicitly mentioned" — instead describe what the document IS about.
- Be specific and concrete, referencing actual content from the context.
- Keep the answer concise."""

            llm = get_llm()

            # 3) Generate answer. For broad queries, force a grounded fallback if
            # the first pass returns a generic insufficiency line despite sources.
            if broad_query:
                first_pass = llm.invoke([HumanMessage(content=prompt)])
                full_response = first_pass.content if hasattr(first_pass, 'content') else str(first_pass)

                if chunks and is_generic_insufficient_response(full_response):
                    retry_prompt = f"""You must answer using the provided context.
            Do not return a generic insufficiency sentence when related context exists.
            Give a concise context-grounded explanation and explicitly tie it to retrieved source content.
            If exact terminology is missing, state this is an approximation based on the retrieved context.

            CONTEXT:
            {context}

            QUESTION: {request.message}"""
                    retry = llm.invoke([HumanMessage(content=retry_prompt)])
                    full_response = retry.content if hasattr(retry, 'content') else str(retry)

                # Emit the answer — no second stream call
                yield f"data: {json.dumps({'type': 'token', 'data': full_response})}\n\n"
                await asyncio.sleep(0)
            else:
                full_response = ""
                for token in llm.stream([HumanMessage(content=prompt)]):
                    text = token.content if hasattr(token, 'content') else str(token)
                    full_response += text
                    yield f"data: {json.dumps({'type': 'token', 'data': text})}\n\n"
                    await asyncio.sleep(0)

            # Save assistant message
            assistant_record: dict[str, Any] = {
                "role": "assistant",
                "content": full_response,
                "sources": sources,
            }
            if auto_selected_files:
                assistant_record["resolved_project_files"] = auto_selected_files
                assistant_record["resolved_project_mode"] = selection_mode

            messages.append(assistant_record)
            save_session_messages(user_id, project_id, session_id, messages)
            
            if redis_client:
                redis_client.setex(cache_key, 43200, json.dumps({"answer": full_response, "sources": sources}))

            yield f"data: {json.dumps({'type': 'done', 'data': session_id})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'data': format_chat_error(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.get("/api/chat/sessions")
async def list_sessions(user_id: Optional[str] = None, project_id: Optional[str] = None):
    """List all chat sessions."""
    if not user_id:
        return {"sessions": []}
    
    sessions = []
    
    if redis_client:
        pid = project_id if project_id else "*"
        # Scan for all sessions for this user + project
        keys = redis_client.keys(f"user:{user_id}:project:{pid}:session:*")
        for key in keys:
            data = redis_client.get(key)
            if data:
                messages = json.loads(data)
                if messages:
                    sid = key.split(":")[-1]
                    first_msg = next((m for m in messages if m["role"] == "user"), None)
                    sessions.append({
                        "id": sid,
                        "title": first_msg["content"][:50] + "..." if first_msg else "New Chat",
                        "message_count": len(messages),
                    })
    else:
        # Fallback to dict (Note: dict currently doesn't store project_id implicitly, so we just return all)
        user_sessions = chat_sessions.get(user_id, {})
        for sid, messages in user_sessions.items():
            if messages:
                first_msg = next((m for m in messages if m["role"] == "user"), None)
                sessions.append({
                    "id": sid,
                    "title": first_msg["content"][:50] + "..." if first_msg else "New Chat",
                    "message_count": len(messages),
                })
                
    return {"sessions": sessions}


@app.get("/api/chat/sessions/{session_id}")
async def get_session(session_id: str, user_id: str, project_id: Optional[str] = None):
    """Get messages for a specific session."""
    pid = project_id if project_id else ""
    messages = get_session_messages(user_id, pid, session_id)
    if not messages:
        # Check global if project_id was passed but failed
        if pid:
            messages = get_session_messages(user_id, "", session_id)
        if not messages:
            raise HTTPException(status_code=404, detail="Session not found")
    return {"session_id": session_id, "messages": messages}


@app.delete("/api/chat/sessions/{session_id}")
async def delete_session(session_id: str, user_id: str, project_id: Optional[str] = None):
    """Delete a chat session."""
    if redis_client:
        pid = project_id if project_id else "*"
        keys = redis_client.keys(f"user:{user_id}:project:{pid}:session:{session_id}")
        for key in keys:
            redis_client.delete(key)
            
    # Fallback memory cleanup
    user_sessions = chat_sessions.get(user_id, {})
    if session_id in user_sessions:
        del user_sessions[session_id]
        save_chat_sessions_to_disk()
        
    return {"status": "deleted"}


# ─── Projects Sync Endpoints ─────────────────────────────────────────
@app.get("/api/projects")
async def list_projects(user_id: Optional[str] = None, auth_user: Optional[str] = Depends(get_optional_user)):
    """Return all synced projects."""
    final_user_id = auth_user or user_id
    if not final_user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    return {"projects": projects_store.get(final_user_id, [])}


@app.put("/api/projects")
async def sync_projects(payload: ProjectsSyncRequest, auth_user: Optional[str] = Depends(get_optional_user)):
    """Replace synced projects snapshot from frontend."""
    final_user_id = auth_user or payload.user_id
    if not final_user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    global projects_store
    projects_store[final_user_id] = payload.projects
    save_projects_to_disk()
    return {"status": "synced", "count": len(payload.projects)}


# ─── Document Endpoints ─────────────────────────────────────────────
@app.post("/api/documents/upload")
async def upload_document(user_id: str = Form(...), file: UploadFile = File(...), auth_user: Optional[str] = Depends(get_optional_user)):
    final_user_id = auth_user or user_id
    if not final_user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    user_id = final_user_id
    import traceback
    try:
        # Validate user_id is a valid UUID before processing
        try:
            uuid.UUID(user_id)
        except (ValueError, TypeError):
            print(f"❌ Invalid user_id format: {user_id}")
            raise HTTPException(
                status_code=400,
                detail=f"Invalid user_id format. Expected UUID, got: {user_id}. Please log out and log back in."
            )
        
        doc_id = str(uuid.uuid4())
        original_filename = Path(file.filename).name
        print(f"📤 Upload received: {original_filename}")  # ← ADD

        stored_filename = f"{doc_id}_{original_filename}"
        file_path = UPLOAD_DIR / stored_filename

        print(f"💾 Saving to: {file_path}")  # ← ADD
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)
        print(f"✅ File saved, size: {len(content)}")  # ← ADD

        shutil.copy2(str(file_path), str(DOCS_DIR / stored_filename))
        print(f"✅ File copied to docs dir")  # ← ADD

        doc_meta = {
            "id": doc_id,
            "filename": original_filename,
            "size": len(content),
            "status": "processing",
            "type": file.content_type or "unknown",
            "user_id": user_id,
        }

        print(f"📝 Creating document record...")  # ← ADD
        create_error = await asyncio.to_thread(create_document_record, doc_meta)
        print(f"📝 create_document_record returned: {create_error}")  # ← ADD

        if create_error:
            raise HTTPException(status_code=500, detail=f"Failed to create document metadata: {create_error}")

        async def process():
            global _vector_store
            try:
                from ingestion import run_complete_ingestion_pipeline
                vs = get_vector_store()
                fr = get_file_router()
                await asyncio.to_thread(
                    run_complete_ingestion_pipeline,
                    str(file_path),
                    vs,
                    fr,
                    original_filename,
                    doc_id,
                    user_id,
                )
                await asyncio.to_thread(vs.persist)

                # ← Force reload so chat retriever picks up new documents
                _vector_store = None

                await asyncio.to_thread(update_document_status, doc_id, "completed")
                print(f"✅ Ingestion complete: {original_filename}")
                if redis_client:
                    redis_client.set(f"job:{doc_id}", "done")
            except Exception as e:
                print(f"❌ Ingestion failed for {original_filename}: {e}")
                import traceback
                traceback.print_exc()
                await asyncio.to_thread(update_document_status, doc_id, "failed", str(e))
                if redis_client:
                    redis_client.set(f"job:{doc_id}", "failed")

        if redis_client:
            job_payload = {
                "file_path": str(file_path),
                "original_filename": original_filename,
                "doc_id": doc_id,
                "user_id": user_id
            }
            redis_client.lpush("queue:documents", json.dumps(job_payload))
            redis_client.set(f"job:{doc_id}", "processing")
            print(f"🚀 Pushed ingestion job to Redis queue for: {original_filename}")
        else:
            asyncio.create_task(process())
            print(f"🚀 Background task created for: {original_filename}")
        return {"document": doc_meta}

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Upload endpoint crashed: {e}")  # ← ADD
        traceback.print_exc()                       # ← ADD
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/documents/status/{doc_id}")
async def get_document_status(doc_id: str):
    """Real-time job tracking status."""
    if not redis_client:
        # Fallback to general documents list status if Redis is not running
        for d in documents_store:
            if d["id"] == doc_id:
                return {"doc_id": doc_id, "status": d.get("status", "processing")}
        return {"doc_id": doc_id, "status": "unknown"}
        
    status = redis_client.get(f"job:{doc_id}")
    if status:
        return {"doc_id": doc_id, "status": status}
    
    return {"doc_id": doc_id, "status": "unknown"}


@app.get("/api/documents")
async def list_documents(user_id: Optional[str] = None, auth_user: Optional[str] = Depends(get_optional_user)):
    """List all uploaded documents with their status for a specific user."""
    final_user_id = auth_user or user_id
    if not final_user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    documents, source_mode, error = get_documents_inventory(final_user_id)
    response: dict[str, Any] = {"documents": documents, "source": source_mode}
    if error:
        response["error"] = error
    return response


@app.delete("/api/documents/{doc_id}")
async def delete_document(doc_id: str, user_id: str = None, auth_user: Optional[str] = Depends(get_optional_user)):
    final_user_id = auth_user or user_id
    if not final_user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
        
    global documents_store

    filename = None
    for d in documents_store:
        if d.get("id") == doc_id:
            filename = d.get("filename")
            break

    documents_store = [d for d in documents_store if d["id"] != doc_id]

    delete_error = await asyncio.to_thread(delete_vectors_for_document, doc_id, filename)

    if delete_error:
        raise HTTPException(status_code=500, detail=delete_error)

    # Invalidate cache
    user_doc_versions[final_user_id] = user_doc_versions.get(final_user_id, 0) + 1

    return {"status": "deleted"}


# ─── Settings Endpoints ─────────────────────────────────────────────
@app.get("/api/settings")
async def get_settings():
    """Get current system settings."""
    return {
        "llm": {
            "provider": os.getenv("LLM_PRIMARY_PROVIDER", "ollama"),
            "model": os.getenv("LLM_PRIMARY_MODEL", "llama3"),
        },
        "embeddings": {
            "provider": os.getenv("EMBEDDINGS_DEFAULT_PROVIDER", "hf"),
            "model": os.getenv("EMBEDDINGS_DEFAULT_MODEL", "all-MiniLM-L6-v2"),
        },
        "available_providers": {
            "llm": ["ollama", "openai"],
            "embeddings": ["hf", "openai"],
        },
        "available_models": {
            "ollama": ["llama3", "llama3:8b-instruct-q4_K_M", "mistral", "codellama", "gemma", "gemma:2b"],
            "openai": ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"],
            "hf": ["all-MiniLM-L6-v2", "all-mpnet-base-v2", "multi-qa-MiniLM-L6-cos-v1"],
        },
    }


@app.post("/api/settings")
async def update_settings(settings: SettingsUpdate):
    """Update system settings (modifies environment variables at runtime)."""
    global _llm, _vector_store

    if settings.llm_provider:
        os.environ["LLM_PRIMARY_PROVIDER"] = settings.llm_provider
        _llm = None  # Force re-initialization

    if settings.llm_model:
        os.environ["LLM_PRIMARY_MODEL"] = settings.llm_model
        _llm = None

    if settings.embeddings_provider:
        os.environ["EMBEDDINGS_DEFAULT_PROVIDER"] = settings.embeddings_provider
        _vector_store = None

    if settings.embeddings_model:
        os.environ["EMBEDDINGS_DEFAULT_MODEL"] = settings.embeddings_model
        _vector_store = None

    return {"status": "updated", "message": "Settings updated. Changes take effect on next request."}


# ─── Run ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
