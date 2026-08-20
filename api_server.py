"""
FastAPI server wrapping the existing RAG system.
Provides endpoints for chat, document management, and settings.
"""
import os
import json
import uuid
import asyncio
import shutil
import importlib
import re as _re
from difflib import SequenceMatcher

import hashlib
import secrets
import redis
import base64
import hmac
import time
import logging
from contextlib import asynccontextmanager

from typing import Any, List, Optional
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException, Form, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from langchain_core.messages import HumanMessage

from dotenv import load_dotenv

_DOTENV_PATH = Path(__file__).resolve().parent / ".env"
if _DOTENV_PATH.exists():
    load_dotenv(dotenv_path=_DOTENV_PATH, encoding="utf-8")
else:
    load_dotenv()

import hashlib
import secrets

logger = logging.getLogger("rag.api")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO").upper(), format="%(message)s")


@asynccontextmanager
async def app_lifespan(_app: FastAPI):
    """Warm the existing vector-store singleton before serving requests."""
    await warm_vector_store()
    yield


# ─── App Setup ───────────────────────────────────────────────────────
app = FastAPI(title="RAG System API", version="1.0.0", lifespan=app_lifespan)

ACCESS_TOKEN_TTL_SECONDS = int(os.getenv("ACCESS_TOKEN_TTL_SECONDS", "3600"))
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(25 * 1024 * 1024)))
ALLOWED_UPLOAD_EXTENSIONS = {".pdf", ".docx", ".xlsx", ".csv"}
ACCESS_TOKEN_SECRET = os.getenv("ACCESS_TOKEN_SECRET") or os.getenv("NEXTAUTH_SECRET")
if not ACCESS_TOKEN_SECRET:
    ACCESS_TOKEN_SECRET = secrets.token_urlsafe(32)
INTERNAL_AUTH_SECRET = os.getenv("INTERNAL_AUTH_SECRET") or ACCESS_TOKEN_SECRET
ADMIN_USER_ID = os.getenv("ADMIN_USER_ID", "").strip()

configured_origins = [
    origin.strip().rstrip("/")
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=configured_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def request_context_middleware(request, call_next):
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    started = time.perf_counter()
    request.state.request_id = request_id
    request.state.request_started = started
    try:
        response = await call_next(request)
    except Exception:
        logger.exception("request_failed request_id=%s method=%s path=%s", request_id, request.method, request.url.path)
        raise
    elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
    response.headers["X-Request-ID"] = request_id
    logger.info(
        "request_complete request_id=%s method=%s path=%s status=%s duration_ms=%s",
        request_id,
        request.method,
        request.url.path,
        response.status_code,
        elapsed_ms,
    )
    return response


def elapsed_ms(started: float) -> float:
    return round((time.perf_counter() - started) * 1000, 2)


def log_chat_timing(request_id: str, timing: dict[str, Any]) -> None:
    logger.info("chat_timing request_id=%s timings=%s", request_id, json.dumps(timing, sort_keys=True))


def issue_access_token(user_id: str) -> str:
    expires_at = int(time.time()) + ACCESS_TOKEN_TTL_SECONDS
    payload = f"{user_id}.{expires_at}".encode("ascii")
    signature = hmac.new(ACCESS_TOKEN_SECRET.encode("utf-8"), payload, hashlib.sha256).digest()
    encoded_payload = base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")
    encoded_signature = base64.urlsafe_b64encode(signature).decode("ascii").rstrip("=")
    return f"{encoded_payload}.{encoded_signature}"


def authenticate_request(authorization: Optional[str], requested_user_id: str) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        encoded_payload, encoded_signature = authorization.split(" ", 1)[1].split(".", 1)
        padded = encoded_payload + "=" * (-len(encoded_payload) % 4)
        payload = base64.urlsafe_b64decode(padded.encode("ascii"))
        expected = hmac.new(ACCESS_TOKEN_SECRET.encode("utf-8"), payload, hashlib.sha256).digest()
        supplied = base64.urlsafe_b64decode((encoded_signature + "=" * (-len(encoded_signature) % 4)).encode("ascii"))
        if not hmac.compare_digest(expected, supplied):
            raise ValueError("invalid signature")
        token_user_id, expiry = payload.decode("ascii").split(".", 1)
        if int(expiry) < int(time.time()) or token_user_id != requested_user_id:
            raise ValueError("invalid subject")
        uuid.UUID(token_user_id)
        return token_user_id
    except (ValueError, TypeError, UnicodeDecodeError, base64.binascii.Error):
        raise HTTPException(status_code=401, detail="Invalid or expired access token")


def authenticate_internal_request(secret: Optional[str]) -> None:
    if not secret or not hmac.compare_digest(secret, INTERNAL_AUTH_SECRET):
        raise HTTPException(status_code=401, detail="Internal authentication required")

# ─── Redis Setup ────────────────────────────────────────────────────────
redis_client = None
try:
    redis_client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)
    redis_client.ping()
    print("[OK] Connected to Redis successfully.")
except Exception as e:
    print(f"[WARN] Redis connection failed: {e}. Continuing without Redis cache/jobs.")
    redis_client = None


def invalidate_user_chat_cache(user_id: str):
    """Drop cached answers whose retrieval context may have changed."""
    if not redis_client:
        return
    for key in redis_client.scan_iter(match=f"cache:{user_id}:*"):
        redis_client.delete(key)

UPLOAD_DIR = Path("./uploads")
UPLOAD_DIR.mkdir(exist_ok=True)
DOCS_DIR = Path("./docs")
DOCS_DIR.mkdir(exist_ok=True)

def get_psycopg_connection():
    dsn = os.getenv("POSTGRES_DOCUMENTS_DSN") or os.getenv("DATABASE_URL")
    if not dsn:
        raise ValueError("Missing POSTGRES_DOCUMENTS_DSN")
    if dsn.startswith("postgresql+"):
        dsn = "postgresql://" + dsn.split("://", 1)[1]
    psycopg = importlib.import_module("psycopg")
    psycopg_rows = importlib.import_module("psycopg.rows")
    return psycopg.connect(dsn, row_factory=getattr(psycopg_rows, "dict_row"))


def init_postgres_tables():
    try:
        with get_psycopg_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS users (
                        id UUID PRIMARY KEY,
                        email VARCHAR(255) UNIQUE NOT NULL,
                        password_hash VARCHAR(255) NOT NULL,
                        salt VARCHAR(255) NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)

                cur.execute("""
                    CREATE TABLE IF NOT EXISTS documents (
                        id UUID PRIMARY KEY,
                        project_id UUID NOT NULL,
                        user_id UUID NOT NULL,
                        file_name TEXT NOT NULL,
                        source_type TEXT NOT NULL,
                        status TEXT NOT NULL DEFAULT 'processing',
                        chunk_count INTEGER NOT NULL DEFAULT 0,
                        file_size_bytes BIGINT NOT NULL DEFAULT 0,
                        error_message TEXT NULL,
                        is_deleted BOOLEAN NOT NULL DEFAULT false,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        deleted_at TIMESTAMP NULL,
                        ingested_at TIMESTAMP NULL
                    )
                """)

                cur.execute("""
                    CREATE TABLE IF NOT EXISTS conversations (
                        id TEXT PRIMARY KEY,
                        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                        project_id TEXT NULL,
                        title TEXT NOT NULL DEFAULT 'New Chat',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS messages (
                        id BIGSERIAL PRIMARY KEY,
                        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                        role TEXT NOT NULL,
                        content TEXT NOT NULL,
                        sources JSONB NULL,
                        is_cached BOOLEAN NOT NULL DEFAULT false,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS queries (
                        id UUID PRIMARY KEY,
                        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                        query_text TEXT NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS responses (
                        id UUID PRIMARY KEY,
                        query_id UUID NULL REFERENCES queries(id) ON DELETE SET NULL,
                        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                        content TEXT NOT NULL,
                        sources JSONB NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS projects (
                        id TEXT NOT NULL,
                        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                        payload JSONB NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        PRIMARY KEY (user_id, id)
                    )
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS application_metadata (
                        key TEXT PRIMARY KEY,
                        value JSONB NOT NULL,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                cur.execute("CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, updated_at DESC)")
                cur.execute("CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, id)")
                cur.execute("CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id, is_deleted)")
                cur.execute("ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT NOT NULL DEFAULT 0")
                cur.execute("ALTER TABLE documents ADD COLUMN IF NOT EXISTS error_message TEXT NULL")
            conn.commit()
    except Exception as e:
        print(f"Warning: Failed to init postgres tables: {e}")


init_postgres_tables()


def hash_password(password: str, salt: str) -> str:
    """Hash password with salt using PBKDF2."""
    return hashlib.pbkdf2_hmac("sha512", password.encode(), salt.encode(), 100000).hex()


def find_user_by_email(email: str) -> Optional[dict]:
    try:
        with get_psycopg_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM users WHERE email = %s", (email,))
                row = cur.fetchone()
                if row:
                    # Format UUID object to string
                    res = dict(row)
                    res["id"] = str(res["id"])
                    return res
    except Exception as e:
        print(f"Error finding user: {e}")
    return None


def create_user(email: str, password: str = "") -> dict:
    if find_user_by_email(email):
        raise ValueError("User already exists")
    
    if password:
        salt = secrets.token_hex(16)
        password_hash = hash_password(password, salt)
    else:
        # For OAuth users, dummy values
        salt = "oauth"
        password_hash = "oauth"
    user_id = str(uuid.uuid4())

    try:
        with get_psycopg_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO users (id, email, password_hash, salt) VALUES (%s, %s, %s, %s)",
                    (user_id, email, password_hash, salt)
                )
            conn.commit()
    except Exception as e:
        raise ValueError(f"Failed to create user: {e}")
        
    return {"id": user_id, "email": email.strip().lower()}


def validate_user(email: str, password: str) -> Optional[dict]:
    user = find_user_by_email(email)
    if not user:
        return None
    
    if user["password_hash"] == "oauth":
        # OAuth user, no password check
        return {"id": user["id"], "email": user["email"]}
    
    password_hash = hash_password(password, user["salt"])
    if password_hash == user["password_hash"]:
        return {"id": user["id"], "email": user["email"]}
    return None


def _json_value(value: Any, default: Any = None) -> Any:
    return default if value is None else value


def get_session_messages(user_id: str, project_id: str, session_id: str) -> list:
    """Load durable conversation messages from PostgreSQL."""
    with get_psycopg_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT m.role, m.content, m.sources, m.is_cached
                FROM messages m
                JOIN conversations c ON c.id = m.conversation_id
                WHERE c.id = %s AND c.user_id = %s::uuid
                  AND c.project_id IS NOT DISTINCT FROM %s
                ORDER BY m.id
                """,
                (session_id, user_id, project_id or None),
            )
            rows = cur.fetchall()
    return [
        {
            "role": row["role"],
            "content": row["content"],
            "sources": _json_value(row.get("sources"), []),
            **({"is_cached": True} if row.get("is_cached") else {}),
        }
        for row in rows
    ]


def save_session_messages(user_id: str, project_id: str, session_id: str, messages: list):
    """Persist conversations, messages, queries, and responses in one transaction."""
    from psycopg.types.json import Jsonb

    first_user = next((m for m in messages if m.get("role") == "user"), None)
    title = (first_user or {}).get("content", "New Chat")[:50] or "New Chat"
    with get_psycopg_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO conversations (id, user_id, project_id, title)
                VALUES (%s, %s::uuid, %s, %s)
                ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, updated_at = CURRENT_TIMESTAMP
                """,
                (session_id, user_id, project_id or None, title),
            )
            cur.execute("DELETE FROM queries WHERE conversation_id = %s", (session_id,))
            cur.execute("DELETE FROM responses WHERE conversation_id = %s", (session_id,))
            cur.execute("DELETE FROM messages WHERE conversation_id = %s", (session_id,))

            last_query_id = None
            for message in messages:
                sources = message.get("sources")
                cur.execute(
                    """
                    INSERT INTO messages (conversation_id, role, content, sources, is_cached)
                    VALUES (%s, %s, %s, %s::jsonb, %s)
                    """,
                    (session_id, message.get("role", "assistant"), message.get("content", ""),
                     json.dumps(sources or []), bool(message.get("is_cached"))),
                )
                if message.get("role") == "user":
                    last_query_id = str(uuid.uuid4())
                    cur.execute(
                        "INSERT INTO queries (id, conversation_id, user_id, query_text) VALUES (%s::uuid, %s, %s::uuid, %s)",
                        (last_query_id, session_id, user_id, message.get("content", "")),
                    )
                elif message.get("role") == "assistant":
                    cur.execute(
                        """
                        INSERT INTO responses (id, query_id, conversation_id, content, sources)
                        VALUES (%s::uuid, %s::uuid, %s, %s, %s::jsonb)
                        """,
                        (str(uuid.uuid4()), last_query_id, session_id, message.get("content", ""), json.dumps(sources or [])),
                    )
        conn.commit()

# ─── Lazy-loaded RAG components ─────────────────────────────────────
_vector_store = None
_vector_store_ready = False
_vector_store_warmup_error: Optional[str] = None
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


def build_retrieval_fallback_answer(chunks: List[Any]) -> str:
    """Return a useful sourced answer when the configured LLM is unavailable."""
    excerpts = []
    for chunk in chunks[:3]:
        text = " ".join(str(getattr(chunk, "page_content", "")).split())
        if text:
            excerpts.append(text[:500])
    if not excerpts:
        return "I found matching documents, but they did not contain readable text."
    return (
        "The configured language model is currently unavailable, so here are the most relevant "
        "excerpts from your uploaded documents:\n\n- " + "\n- ".join(excerpts)
    )


def dedupe_chunks(chunks: List[Any]) -> List[Any]:
    """Remove duplicate retrieved chunks while preserving order."""
    seen = set()
    unique = []
    for chunk in chunks:
        metadata = getattr(chunk, "metadata", {}) or {}
        key = metadata.get("chunk_id") or getattr(chunk, "id", None)
        if not key:
            # Preserve the existing fallback for chunks without deterministic IDs.
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


def infer_project_files_from_session(user_id: str, project_id: str, session_id: str) -> List[str]:
    """Fallback to recently used source files in the current chat session."""
    messages = get_session_messages(user_id, project_id, session_id)
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
    """Document metadata is always stored in PostgreSQL."""
    return "postgres"


def fetch_documents_from_postgres(user_id: str) -> tuple[List[dict], Optional[str]]:
    """Fetch documents metadata rows from Postgres for a specific user."""
    dsn = os.getenv("POSTGRES_DOCUMENTS_DSN") or os.getenv("DATABASE_URL")
    if not dsn:
        return [], "Missing POSTGRES_DOCUMENTS_DSN or DATABASE_URL"

    if dsn.startswith("postgresql+"):
        dsn = "postgresql://" + dsn.split("://", 1)[1]

    query = "SELECT id, file_name as filename, file_size_bytes as size, status, error_message as error, source_type as type FROM documents WHERE user_id = %s::uuid AND is_deleted = false ORDER BY created_at DESC LIMIT 200"

    try:
        psycopg = importlib.import_module("psycopg")
        psycopg_rows = importlib.import_module("psycopg.rows")
        dict_row = getattr(psycopg_rows, "dict_row")
    except Exception:
        return [], "psycopg is not installed in this environment"

    try:
        with psycopg.connect(dsn) as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute(query, (user_id,))
                rows = cur.fetchall()
    except Exception as e:
        return [], str(e)

    documents: List[dict] = []
    for row in rows:
        item = dict(row)
        raw_status = str(item.get("status", "unknown"))
        status_map = {
            "active": "completed",
            "pending": "processing",
            "deleting": "processing",
        }
        documents.append(
            {
                "id": str(item.get("id", "unknown")),
                "filename": str(item.get("filename", "unknown")),
                "size": int(item.get("size") or 0),
                "status": status_map.get(raw_status, raw_status),
                "type": str(item.get("type", "unknown")),
            }
        )

    return documents, None


def get_documents_inventory(user_id: str) -> tuple[List[dict], str, Optional[str]]:
    """Return documents and source mode; optionally returns retrieval error."""
    source_mode = get_documents_source_mode()
    if source_mode == "postgres":
        docs, error = fetch_documents_from_postgres(user_id)
        return docs, source_mode, error

    return [], source_mode, "PostgreSQL document metadata is unavailable"


def get_active_documents_scope(user_id: str) -> Optional[tuple[set[str], set[str], dict[str, set[str]]]]:
    """Return active (completed) document ids and filenames for retrieval filtering.

    Returns None when metadata is unavailable so retrieval can gracefully fall back.
    """
    documents, _, error = get_documents_inventory(user_id)
    if error:
        return None

    active_ids: set[str] = set()
    active_filenames: set[str] = set()
    filename_to_ids: dict[str, set[str]] = {}

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
            filename_to_ids.setdefault(filename, set()).add(doc_id)

    return active_ids, active_filenames, filename_to_ids


def build_retrieval_filter(
    user_id: str,
    project_files: List[str],
    active_scope: Optional[tuple[set[str], set[str], dict[str, set[str]]]],
) -> Optional[dict]:
    """Build a Chroma metadata filter for user and optional project documents."""
    if not project_files:
        return {"user_id": user_id}
    if not active_scope:
        return None

    _, _, filename_to_ids = active_scope
    source_ids = sorted({
        source_id
        for filename in project_files
        for source_id in filename_to_ids.get(filename, set())
    })
    if not source_ids:
        return None

    return {
        "$and": [
            {"user_id": user_id},
            {"source_id": {"$in": source_ids}},
        ]
    }


def normalize_transaction_id(value: str) -> str:
    """Normalize a supported transaction identifier for exact matching."""
    return str(value).strip().upper()


def detect_transaction_id(query: str) -> Optional[str]:
    """Detect the deliberately narrow TXN-<digits> query identifier format."""
    match = _re.search(r"\bTXN-\d+\b", str(query or ""), flags=_re.IGNORECASE)
    return normalize_transaction_id(match.group(0)) if match else None


def build_exact_transaction_filter(
    user_id: str,
    transaction_id: str,
    project_files: List[str],
    active_scope: Optional[tuple[set[str], set[str], dict[str, set[str]]]],
) -> Optional[dict]:
    """Build a scoped Chroma filter for one transaction identifier."""
    if not active_scope:
        return None

    metadata_filter = build_retrieval_filter(user_id, project_files, active_scope)
    if project_files and metadata_filter is None:
        return None

    if project_files:
        conditions = metadata_filter["$and"]
    else:
        active_ids, _, _ = active_scope
        if not active_ids:
            return None
        conditions = [
            {"user_id": user_id},
            {"source_id": {"$in": sorted(active_ids)}},
        ]

    return {"$and": [*conditions, {"transaction_id": normalize_transaction_id(transaction_id)}]}


def retrieve_exact_transaction(
    vector_store: Any,
    transaction_id: str,
    retrieve_k: int,
    user_id: str,
    project_files: List[str],
    active_scope: Optional[tuple[set[str], set[str], dict[str, set[str]]]],
) -> List[Any]:
    """Retrieve transaction rows through Chroma metadata filtering only."""
    exact_filter = build_exact_transaction_filter(
        user_id, transaction_id, project_files, active_scope
    )
    if exact_filter is None:
        return []

    chroma_store = (
        vector_store.load_or_create()
        if hasattr(vector_store, "load_or_create")
        else vector_store
    )
    chunks = chroma_store.similarity_search(
        normalize_transaction_id(transaction_id),
        k=retrieve_k,
        filter=exact_filter,
    )
    if active_scope:
        active_ids, active_filenames, _ = active_scope
        chunks = [
            chunk for chunk in chunks
            if chunk_matches_active_documents(chunk, active_ids, active_filenames)
        ]
    return dedupe_chunks(chunks)


async def retrieve_chunks(
    vector_store: Any,
    query: str,
    retrieve_k: int,
    broad_query: bool,
    user_id: str,
    project_files: List[str],
    active_scope: Optional[tuple[set[str], set[str], dict[str, set[str]]]],
    timing: Optional[dict[str, Any]] = None,
) -> List[Any]:
    """Retrieve exact transaction rows first, then use the existing semantic path."""
    metadata_filter = build_retrieval_filter(user_id, project_files, active_scope)
    if project_files and metadata_filter is None:
        return []

    exact_chunks = []
    transaction_id = detect_transaction_id(query)
    if transaction_id:
        exact_started = time.perf_counter()
        exact_chunks = await asyncio.to_thread(
            retrieve_exact_transaction,
            vector_store,
            transaction_id,
            retrieve_k,
            user_id,
            project_files,
            active_scope,
        )
        if timing is not None:
            timing["exact_retrieval_duration_ms"] = round(
                (time.perf_counter() - exact_started) * 1000, 2
            )

    semantic_started = time.perf_counter()
    retriever = vector_store.as_retriever(
        search_type="mmr",
        search_kwargs={
            "k": retrieve_k,
            "fetch_k": max(retrieve_k * 2, 12),
            "lambda_mult": 0.45,
            "filter": metadata_filter,
        },
    )
    chunks: List[Any] = []
    for retrieval_query in build_retrieval_queries(query, broad_query):
        chunks.extend(await asyncio.to_thread(retriever.invoke, retrieval_query))

    if active_scope:
        active_ids, active_filenames, _ = active_scope
        chunks = [
            chunk for chunk in chunks
            if chunk_matches_active_documents(chunk, active_ids, active_filenames)
        ]

    if timing is not None:
        timing["semantic_retrieval_duration_ms"] = round(
            (time.perf_counter() - semantic_started) * 1000, 2
        )

    return dedupe_chunks([*exact_chunks, *chunks])[:retrieve_k]


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
    """Create a metadata row in the configured source and return an optional error."""
    dsn = os.getenv("POSTGRES_DOCUMENTS_DSN") or os.getenv("DATABASE_URL")
    if not dsn:
        return "Missing POSTGRES_DOCUMENTS_DSN or DATABASE_URL"
    if dsn.startswith("postgresql+"):
        dsn = "postgresql://" + dsn.split("://", 1)[1]

    project_id = os.getenv("POSTGRES_DOCUMENTS_PROJECT_ID", "00000000-0000-0000-0000-000000000000")
    source_type = doc_meta.get("type", "upload")

    # Validate user_id is a valid UUID
    user_id = doc_meta.get("user_id")
    try:
        uuid.UUID(user_id)
    except (ValueError, TypeError):
        return f"Invalid user_id format: {user_id}"

    try:
        psycopg = importlib.import_module("psycopg")
    except Exception:
        return "psycopg is not installed in this environment"

    query = """
        INSERT INTO documents (id, project_id, user_id, file_name, source_type, status, chunk_count, file_size_bytes, error_message, is_deleted, created_at, updated_at)
        VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, 0, %s, NULL, false, now(), now())
    """

    try:
        with psycopg.connect(dsn) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    query,
                    (
                        doc_meta.get("id"),
                        project_id,
                        user_id,
                        doc_meta.get("filename"),
                        source_type,
                        doc_meta.get("status", "processing"),
                        int(doc_meta.get("size", 0)),
                    ),
                )
            conn.commit()
    except Exception as e:
        return str(e)

    return None


def update_document_status(doc_id: str, status: str, error_message: Optional[str] = None, chunk_count: Optional[int] = None) -> Optional[str]:
    """Update document status in configured source and return an optional error."""
    dsn = os.getenv("POSTGRES_DOCUMENTS_DSN") or os.getenv("DATABASE_URL")
    if not dsn:
        return "Missing POSTGRES_DOCUMENTS_DSN or DATABASE_URL"
    if dsn.startswith("postgresql+"):
        dsn = "postgresql://" + dsn.split("://", 1)[1]

    try:
        psycopg = importlib.import_module("psycopg")
    except Exception:
        return "psycopg is not installed in this environment"

    db_status = {
        "completed": "active",
    }.get(status, status)

    query = """
        UPDATE documents
        SET status = %s,
            error_message = %s,
            chunk_count = COALESCE(%s, chunk_count),
            updated_at = now(),
            ingested_at = CASE WHEN %s = 'active' THEN now() ELSE ingested_at END
        WHERE id = %s::uuid
    """

    try:
        with psycopg.connect(dsn) as conn:
            with conn.cursor() as cur:
                cur.execute(query, (db_status, error_message, chunk_count, db_status, doc_id))
            conn.commit()
    except Exception as e:
        return str(e)

    return None


def build_documents_inventory_answer(user_id: str) -> tuple[str, List[dict]]:
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


async def warm_vector_store() -> bool:
    """Initialize the existing vector-store singleton during application startup."""
    global _vector_store_ready, _vector_store_warmup_error
    started = time.perf_counter()
    try:
        vector_store = get_vector_store()
        await asyncio.to_thread(vector_store.load_or_create)
        _vector_store_ready = True
        _vector_store_warmup_error = None
        logger.info(
            "vector_store_warmup status=ready duration_ms=%s",
            round((time.perf_counter() - started) * 1000, 2),
        )
        return True
    except Exception as error:
        _vector_store_ready = False
        _vector_store_warmup_error = str(error)
        logger.exception(
            "vector_store_warmup status=failed duration_ms=%s",
            round((time.perf_counter() - started) * 1000, 2),
        )
        return False


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
    access_token: str


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
    vector_store_status = "ready" if _vector_store_ready else "disconnected"

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


@app.get("/api/ready")
async def readiness_check():
    """Report whether the API dependencies are ready to serve traffic."""
    checks = {
        "postgres": False,
        "vector_store": _vector_store_ready,
        "llm_config": bool(os.getenv("LLM_PRIMARY_PROVIDER") and os.getenv("LLM_PRIMARY_MODEL")),
        "embeddings_config": bool(os.getenv("EMBEDDINGS_DEFAULT_PROVIDER") and os.getenv("EMBEDDINGS_DEFAULT_MODEL")),
    }
    try:
        with get_psycopg_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                checks["postgres"] = cur.fetchone() is not None
    except Exception:
        checks["postgres"] = False

    ready = all(checks.values())
    content = {"status": "ready" if ready else "not_ready", "checks": checks}
    if not _vector_store_ready and _vector_store_warmup_error:
        content["vector_store_error"] = _vector_store_warmup_error
    return JSONResponse(status_code=200 if ready else 503, content=content)


# ─── Auth Endpoints ──────────────────────────────────────────────────
@app.post("/api/auth/register", response_model=AuthResponse)
async def register_endpoint(request: AuthRequest):
    if not request.password:
        raise HTTPException(status_code=400, detail="Password required for registration")
    try:
        user = create_user(request.email, request.password)
        return AuthResponse(**user, access_token=issue_access_token(user["id"]))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/auth/login", response_model=AuthResponse)
async def login_endpoint(request: AuthRequest):
    if not request.password:
        raise HTTPException(status_code=400, detail="Password required for login")
    user = validate_user(request.email, request.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return AuthResponse(**user, access_token=issue_access_token(user["id"]))

@app.post("/api/auth/find-or-create", response_model=AuthResponse)
async def find_or_create_user_endpoint(request: AuthRequest, x_internal_auth: Optional[str] = Header(default=None)):
    """Find or create user (OAuth flow). Always returns backend-generated UUID."""
    authenticate_internal_request(x_internal_auth)
    try:
        user = find_user_by_email(request.email)
        if not user:
            user = create_user(request.email, request.password or "")
        
        # Validate user_id is a valid UUID
        try:
            uuid.UUID(user.get("id"))
        except (ValueError, TypeError):
            raise ValueError(f"Invalid user UUID: {user.get('id')}")
        
        print(f"✅ Auth successful for {request.email}, UUID: {user.get('id')}")
        return AuthResponse(**user, access_token=issue_access_token(user["id"]))
    except Exception as e:
        print(f"❌ Error in find_or_create: {e}")
        raise HTTPException(status_code=500, detail=f"Auth error: {str(e)}")


@app.get("/api/auth/me")
async def get_current_user(user_id: str, authorization: Optional[str] = Header(default=None)):
    """Get current user info (for debugging). Validates user_id format."""
    authenticate_request(authorization, user_id)
    try:
        # Validate user_id is a valid UUID
        uuid.UUID(user_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail=f"Invalid user_id format: {user_id}. Expected UUID.")
    
    try:
        with get_psycopg_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id, email, created_at FROM users WHERE id = %s::uuid", (user_id,))
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="User not found")
                return {
                    "id": str(row["id"]),
                    "email": row["email"],
                    "created_at": str(row.get("created_at", "")),
                }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch user: {str(e)}")


# ─── Chat Endpoints ─────────────────────────────────────────────────
@app.post("/api/chat")
async def chat(
    request: ChatRequest,
    raw_request: Request,
    authorization: Optional[str] = Header(default=None),
):
    """
    Chat endpoint with RAG retrieval.
    Returns a streaming response that sends tokens progressively.
    """
    request_id = getattr(raw_request.state, "request_id", "unknown")
    request_started = getattr(raw_request.state, "request_started", time.perf_counter())
    timing: dict[str, Any] = {
        "request_entry_ms": 0.0,
        "request_id": request_id,
    }

    authentication_started = time.perf_counter()
    try:
        user_id = authenticate_request(authorization, request.user_id)
    except Exception:
        timing["authentication_duration_ms"] = round(
            (time.perf_counter() - authentication_started) * 1000, 2
        )
        timing["total_request_duration_ms"] = elapsed_ms(request_started)
        timing["outcome"] = "authentication_error"
        log_chat_timing(request_id, timing)
        raise
    timing["authentication_duration_ms"] = round(
        (time.perf_counter() - authentication_started) * 1000, 2
    )
    session_id = request.session_id or str(uuid.uuid4())
    project_id = request.project_id or ""

    session_load_started = time.perf_counter()
    messages = get_session_messages(user_id, project_id, session_id)
    timing["session_loading_duration_ms"] = round(
        (time.perf_counter() - session_load_started) * 1000, 2
    )
    messages.append({
        "role": "user",
        "content": request.message,
    })
    user_persist_started = time.perf_counter()
    save_session_messages(user_id, project_id, session_id, messages)
    timing["user_message_persistence_duration_ms"] = round(
        (time.perf_counter() - user_persist_started) * 1000, 2
    )

    # ─── Smart AI Response Caching ──────────────────────────────
    query_hash = hashlib.sha256(request.message.strip().lower().encode()).hexdigest()
    cache_key = f"cache:{user_id}:{project_id}:{query_hash}"

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
                assistant_persist_started = time.perf_counter()
                save_session_messages(user_id, project_id, session_id, messages)
                timing["assistant_message_persistence_duration_ms"] = round(
                    (time.perf_counter() - assistant_persist_started) * 1000, 2
                )
                timing["outcome"] = "cached"
                timing["final_sse_done_event_ms"] = elapsed_ms(request_started)
                timing["total_request_duration_ms"] = timing["final_sse_done_event_ms"]
                log_chat_timing(request_id, timing)
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
                assistant_persist_started = time.perf_counter()
                save_session_messages(user_id, project_id, session_id, messages)
                timing["assistant_message_persistence_duration_ms"] = round(
                    (time.perf_counter() - assistant_persist_started) * 1000, 2
                )
                
                if redis_client:
                    redis_client.setex(cache_key, 43200, json.dumps({"answer": answer, "sources": sources}))

                timing["outcome"] = "document_inventory"
                timing["final_sse_done_event_ms"] = elapsed_ms(request_started)
                timing["total_request_duration_ms"] = timing["final_sse_done_event_ms"]
                log_chat_timing(request_id, timing)
                yield f"data: {json.dumps({'type': 'done', 'data': session_id})}\n\n"
                return

            query_processing_started = time.perf_counter()
            vs = get_vector_store()
            timing["vector_store_setup_duration_ms"] = round(
                (time.perf_counter() - query_processing_started) * 1000, 2
            )
            broad_query = is_broad_concept_question(request.message)
            definition_target = extract_definition_target(request.message)
            retrieve_k = max(RAG_TOP_K, 8) if (broad_query or definition_target) else RAG_TOP_K

            scope_started = time.perf_counter()
            active_scope = get_active_documents_scope(user_id)
            active_filenames: set[str] = set()
            if active_scope:
                _, active_filenames, _ = active_scope

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
                session_files = infer_project_files_from_session(user_id, project_id, session_id)
                session_selected_files = [f for f in session_files if f in active_filenames]
                if session_selected_files:
                    project_files = session_selected_files
                    auto_selected_files = session_selected_files
                    selection_mode = "session"
            timing["project_document_scope_resolution_duration_ms"] = round(
                (time.perf_counter() - scope_started) * 1000, 2
            )
            timing["query_processing_duration_ms"] = round(
                (time.perf_counter() - query_processing_started) * 1000, 2
            )

            if auto_selected_files:
                yield f"data: {json.dumps({'type': 'selection', 'data': {'files': auto_selected_files, 'mode': selection_mode}})}\n\n"

            chunks = await retrieve_chunks(
                vector_store=vs,
                query=request.message,
                retrieve_k=retrieve_k,
                broad_query=broad_query,
                user_id=user_id,
                project_files=project_files,
                active_scope=active_scope,
                timing=timing,
            )

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
                assistant_persist_started = time.perf_counter()
                save_session_messages(user_id, project_id, session_id, messages)
                timing["assistant_message_persistence_duration_ms"] = round(
                    (time.perf_counter() - assistant_persist_started) * 1000, 2
                )
                
                if redis_client:
                    redis_client.setex(cache_key, 43200, json.dumps({"answer": answer, "sources": []}))
                
                timing["outcome"] = "no_chunks"
                timing["final_sse_done_event_ms"] = elapsed_ms(request_started)
                timing["total_request_duration_ms"] = timing["final_sse_done_event_ms"]
                log_chat_timing(request_id, timing)
                yield f"data: {json.dumps({'type': 'done', 'data': session_id})}\n\n"
                return

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
            context_started = time.perf_counter()
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
            timing["context_construction_duration_ms"] = round(
                (time.perf_counter() - context_started) * 1000, 2
            )

            prompt_started = time.perf_counter()
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
            timing["prompt_construction_duration_ms"] = round(
                (time.perf_counter() - prompt_started) * 1000, 2
            )

            try:
                llm = get_llm()

                # 3) Generate answer. For broad queries, force a grounded fallback if
                # the first pass returns a generic insufficiency line despite sources.
                if broad_query:
                    llm_started = time.perf_counter()
                    timing["llm_request_start_ms"] = elapsed_ms(request_started)
                    first_pass = llm.invoke([HumanMessage(content=prompt)])
                    full_response = first_pass.content if hasattr(first_pass, 'content') else str(first_pass)
                    timing["time_to_first_token_ms"] = round(
                        (time.perf_counter() - llm_started) * 1000, 2
                    )
                    timing["time_to_final_token_ms"] = timing["time_to_first_token_ms"]

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

                    # Emit the answer - no second stream call
                    yield f"data: {json.dumps({'type': 'token', 'data': full_response})}\n\n"
                    await asyncio.sleep(0)
                else:
                    full_response = ""
                    llm_started = time.perf_counter()
                    timing["llm_request_start_ms"] = elapsed_ms(request_started)
                    first_token_received = False
                    for token in llm.stream([HumanMessage(content=prompt)]):
                        text = token.content if hasattr(token, 'content') else str(token)
                        if not first_token_received:
                            timing["time_to_first_token_ms"] = round(
                                (time.perf_counter() - llm_started) * 1000, 2
                            )
                            first_token_received = True
                        full_response += text
                        timing["time_to_final_token_ms"] = round(
                            (time.perf_counter() - llm_started) * 1000, 2
                        )
                        yield f"data: {json.dumps({'type': 'token', 'data': text})}\n\n"
                        await asyncio.sleep(0)
            except Exception as generation_error:
                if chunks:
                    full_response = build_retrieval_fallback_answer(chunks)
                    yield f"data: {json.dumps({'type': 'token', 'data': full_response})}\n\n"
                else:
                    raise generation_error

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
            assistant_persist_started = time.perf_counter()
            save_session_messages(user_id, project_id, session_id, messages)
            timing["assistant_message_persistence_duration_ms"] = round(
                (time.perf_counter() - assistant_persist_started) * 1000, 2
            )
            
            if redis_client:
                redis_client.setex(cache_key, 43200, json.dumps({"answer": full_response, "sources": sources}))

            timing["outcome"] = "generated"
            timing["final_sse_done_event_ms"] = elapsed_ms(request_started)
            timing["total_request_duration_ms"] = timing["final_sse_done_event_ms"]
            log_chat_timing(request_id, timing)
            yield f"data: {json.dumps({'type': 'done', 'data': session_id})}\n\n"

        except Exception as e:
            timing["outcome"] = "error"
            timing["error"] = format_chat_error(e)
            timing["total_request_duration_ms"] = elapsed_ms(request_started)
            log_chat_timing(request_id, timing)
            yield f"data: {json.dumps({'type': 'error', 'data': format_chat_error(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.get("/api/chat/sessions")
async def list_sessions(user_id: Optional[str] = None, project_id: Optional[str] = None, authorization: Optional[str] = Header(default=None)):
    """List all chat sessions."""
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    authenticate_request(authorization, user_id)
    with get_psycopg_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT c.id, c.title, COUNT(m.id)::int AS message_count
                FROM conversations c
                LEFT JOIN messages m ON m.conversation_id = c.id
                WHERE c.user_id = %s::uuid AND c.project_id IS NOT DISTINCT FROM %s
                GROUP BY c.id, c.title, c.updated_at
                HAVING COUNT(m.id) > 0
                ORDER BY c.updated_at DESC
                """,
                (user_id, project_id or None),
            )
            return {"sessions": [dict(row) for row in cur.fetchall()]}


@app.get("/api/chat/sessions/{session_id}")
async def get_session(session_id: str, user_id: str, project_id: Optional[str] = None, authorization: Optional[str] = Header(default=None)):
    """Get messages for a specific session."""
    authenticate_request(authorization, user_id)
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
async def delete_session(session_id: str, user_id: str, project_id: Optional[str] = None, authorization: Optional[str] = Header(default=None)):
    """Delete a chat session."""
    authenticate_request(authorization, user_id)
    with get_psycopg_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM conversations WHERE id = %s AND user_id = %s::uuid AND project_id IS NOT DISTINCT FROM %s",
                (session_id, user_id, project_id or None),
            )
        conn.commit()
    return {"status": "deleted"}


# ─── Projects Sync Endpoints ─────────────────────────────────────────
@app.get("/api/projects")
async def list_projects(user_id: Optional[str] = None, authorization: Optional[str] = Header(default=None)):
    """Return all synced projects."""
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    authenticate_request(authorization, user_id)
    with get_psycopg_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT payload FROM projects WHERE user_id = %s::uuid ORDER BY updated_at DESC", (user_id,))
            return {"projects": [row["payload"] for row in cur.fetchall()]}


@app.put("/api/projects")
async def sync_projects(payload: ProjectsSyncRequest, authorization: Optional[str] = Header(default=None)):
    """Replace synced projects snapshot from frontend."""
    authenticate_request(authorization, payload.user_id)
    from psycopg.types.json import Jsonb
    with get_psycopg_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM projects WHERE user_id = %s::uuid", (payload.user_id,))
            for project in payload.projects:
                project_id = str(project.get("id") or uuid.uuid4())
                cur.execute(
                    """
                    INSERT INTO projects (id, user_id, payload)
                    VALUES (%s, %s::uuid, %s::jsonb)
                    ON CONFLICT (user_id, id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = CURRENT_TIMESTAMP
                    """,
                    (project_id, payload.user_id, json.dumps(project)),
                )
        conn.commit()
    return {"status": "synced", "count": len(payload.projects)}


# ─── Document Endpoints ─────────────────────────────────────────────
@app.post("/api/documents/upload")
async def upload_document(user_id: str = Form(...), file: UploadFile = File(...), authorization: Optional[str] = Header(default=None)):
    import traceback
    try:
        authenticate_request(authorization, user_id)
        original_filename = Path(file.filename or "").name
        extension = Path(original_filename).suffix.lower()
        if not original_filename or extension not in ALLOWED_UPLOAD_EXTENSIONS:
            raise HTTPException(status_code=415, detail="Unsupported file type. Allowed: PDF, DOCX, XLSX, CSV")
        
        doc_id = str(uuid.uuid4())
        original_filename = Path(file.filename or "").name
        print(f"📤 Upload received: {original_filename}")  # ← ADD

        stored_filename = f"{doc_id}_{original_filename}"
        file_path = UPLOAD_DIR / stored_filename

        content = await file.read(MAX_UPLOAD_BYTES + 1)
        if not content:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")
        if len(content) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail=f"File exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)} MB upload limit")

        print(f"💾 Saving to: {file_path}")  # ← ADD
        with open(file_path, "wb") as f:
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

        invalidate_user_chat_cache(user_id)

        async def process():
            global _vector_store
            try:
                from ingestion import run_complete_ingestion_pipeline
                vs = get_vector_store()
                fr = get_file_router()
                chunk_count = await asyncio.to_thread(
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

                await asyncio.to_thread(update_document_status, doc_id, "completed", None, chunk_count)
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
async def get_document_status(doc_id: str, user_id: str, authorization: Optional[str] = Header(default=None)):
    """Real-time job tracking status."""
    authenticate_request(authorization, user_id)
    if not redis_client:
        dsn = os.getenv("POSTGRES_DOCUMENTS_DSN") or os.getenv("DATABASE_URL")
        if dsn:
            with get_psycopg_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT status FROM documents WHERE id = %s::uuid AND user_id = %s::uuid AND is_deleted = false", (doc_id, user_id))
                    row = cur.fetchone()
                    if row:
                        status = {"active": "completed"}.get(row["status"], row["status"])
                        return {"doc_id": doc_id, "status": status}
        return {"doc_id": doc_id, "status": "unknown"}
        
    status = redis_client.get(f"job:{doc_id}")
    if status:
        return {"doc_id": doc_id, "status": status}
    
    return {"doc_id": doc_id, "status": "unknown"}


@app.get("/api/documents")
async def list_documents(user_id: Optional[str] = None, authorization: Optional[str] = Header(default=None)):
    """List all uploaded documents with their status for a specific user."""
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    authenticate_request(authorization, user_id)
    documents, source_mode, error = get_documents_inventory(user_id)
    response: dict[str, Any] = {"documents": documents, "source": source_mode}
    if error:
        response["error"] = error
    return response


@app.delete("/api/documents/{doc_id}")
async def delete_document(doc_id: str, user_id: str, authorization: Optional[str] = Header(default=None)):
    """Delete a document record."""
    authenticate_request(authorization, user_id)
    filename = None
    with get_psycopg_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT file_name FROM documents WHERE id = %s::uuid AND user_id = %s::uuid AND is_deleted = false",
                (doc_id, user_id),
            )
            row = cur.fetchone()
            if row:
                filename = row["file_name"]
            cur.execute(
                "UPDATE documents SET is_deleted = true, deleted_at = now(), updated_at = now() WHERE id = %s::uuid AND user_id = %s::uuid",
                (doc_id, user_id),
            )
        conn.commit()

    delete_error = await asyncio.to_thread(delete_vectors_for_document, doc_id, filename)
    if delete_error:
        print(f"⚠️ Metadata deleted but vector cleanup failed for {doc_id}: {delete_error}")
    return {"status": "deleted"}


# ─── Settings Endpoints ─────────────────────────────────────────────
@app.get("/api/settings")
async def get_settings():
    """Get current system settings."""
    stored = {}
    with get_psycopg_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT value FROM application_metadata WHERE key = 'settings'")
            row = cur.fetchone()
            if row and isinstance(row.get("value"), dict):
                stored = row["value"]
    return {
        "llm": {
            "provider": stored.get("llm_provider", os.getenv("LLM_PRIMARY_PROVIDER", "ollama")),
            "model": stored.get("llm_model", os.getenv("LLM_PRIMARY_MODEL", "llama3")),
        },
        "embeddings": {
            "provider": stored.get("embeddings_provider", os.getenv("EMBEDDINGS_DEFAULT_PROVIDER", "hf")),
            "model": stored.get("embeddings_model", os.getenv("EMBEDDINGS_DEFAULT_MODEL", "all-MiniLM-L6-v2")),
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
async def update_settings(settings: SettingsUpdate, user_id: str, authorization: Optional[str] = Header(default=None)):
    """Update system settings (modifies environment variables at runtime)."""
    authenticate_request(authorization, user_id)
    if not ADMIN_USER_ID or user_id != ADMIN_USER_ID:
        raise HTTPException(status_code=403, detail="Administrator access required")
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

    with get_psycopg_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT value FROM application_metadata WHERE key = 'settings'")
            row = cur.fetchone()
            stored = row["value"] if row and isinstance(row.get("value"), dict) else {}
            stored.update({key: value for key, value in {
                "llm_provider": settings.llm_provider,
                "llm_model": settings.llm_model,
                "embeddings_provider": settings.embeddings_provider,
                "embeddings_model": settings.embeddings_model,
            }.items() if value})
            cur.execute(
                """
                INSERT INTO application_metadata (key, value)
                VALUES ('settings', %s::jsonb)
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
                """,
                (json.dumps(stored),),
            )
        conn.commit()

    return {"status": "updated", "message": "Settings updated. Changes take effect on next request."}


# ─── Auth Endpoints ───────────────────────────────────────────────────
@app.post("/auth/login")
async def login(request: AuthRequest):
    """Authenticate user with email and password."""
    user = validate_user(request.email, request.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"user": user}


@app.post("/auth/signup")
async def signup(request: AuthRequest):
    """Create a new user account."""
    try:
        user = create_user(request.email, request.password)
        return {"user": user}
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Signup failed")


# ─── Run ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
