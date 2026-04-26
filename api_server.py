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

from typing import Any, List, Optional
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from langchain_core.messages import HumanMessage

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

# ─── In-memory stores (would be DB in production) ───────────────────
chat_sessions = {}   # session_id -> list of messages
documents_store = [] # list of document metadata dicts

SESSIONS_FILE = Path("./chat_sessions.json")

UPLOAD_DIR = Path("./uploads")
UPLOAD_DIR.mkdir(exist_ok=True)
DOCS_DIR = Path("./docs")
DOCS_DIR.mkdir(exist_ok=True)


def load_chat_sessions_from_disk():
    """Load chat history from disk if available."""
    global chat_sessions
    if not SESSIONS_FILE.exists():
        return

    try:
        with open(SESSIONS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            chat_sessions = data
    except Exception:
        # Keep server running even if history file is malformed.
        chat_sessions = {}


def save_chat_sessions_to_disk():
    """Persist chat history so sessions survive server restarts."""
    try:
        with open(SESSIONS_FILE, "w", encoding="utf-8") as f:
            json.dump(chat_sessions, f, ensure_ascii=False, indent=2)
    except Exception:
        # Persistence failures should not break API responses.
        pass


load_chat_sessions_from_disk()

# ─── Lazy-loaded RAG components ─────────────────────────────────────
_vector_store = None
_file_router = None
_llm = None

RAG_TOP_K = int(os.getenv("RAG_TOP_K", "5"))
RAG_CHUNK_CHARS = int(os.getenv("RAG_CHUNK_CHARS", "2000"))
RAG_MAX_CONTEXT_CHARS = int(os.getenv("RAG_MAX_CONTEXT_CHARS", "8000"))


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
    """Resolve where document metadata should be read from."""
    mode = os.getenv("DOCUMENTS_METADATA_SOURCE", "memory").strip().lower()
    if mode in {"postgres", "postgresql"}:
        return "postgres"

    if os.getenv("POSTGRES_DOCUMENTS_DSN") or os.getenv("DATABASE_URL"):
        return "postgres"

    return "memory"


def fetch_documents_from_postgres() -> tuple[List[dict], Optional[str]]:
    """Fetch documents metadata rows from Postgres using a configurable query."""
    dsn = os.getenv("POSTGRES_DOCUMENTS_DSN") or os.getenv("DATABASE_URL")
    if not dsn:
        return [], "Missing POSTGRES_DOCUMENTS_DSN or DATABASE_URL"

    # Accept SQLAlchemy-style DSN values such as postgresql+asyncpg://...
    if dsn.startswith("postgresql+"):
        dsn = "postgresql://" + dsn.split("://", 1)[1]

    query = os.getenv(
        "POSTGRES_DOCUMENTS_QUERY",
        "SELECT id, filename, size, status, type FROM documents ORDER BY id DESC LIMIT 200",
    )

    try:
        psycopg = importlib.import_module("psycopg")
        psycopg_rows = importlib.import_module("psycopg.rows")
        dict_row = getattr(psycopg_rows, "dict_row")
    except Exception:
        return [], "psycopg is not installed in this environment"

    try:
        with psycopg.connect(dsn) as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute(query)
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


def get_documents_inventory() -> tuple[List[dict], str, Optional[str]]:
    """Return documents and source mode; optionally returns retrieval error."""
    source_mode = get_documents_source_mode()
    if source_mode == "postgres":
        docs, error = fetch_documents_from_postgres()
        return docs, source_mode, error

    return documents_store, source_mode, None


def create_document_record(doc_meta: dict) -> Optional[str]:
    """Create a metadata row in the configured source and return an optional error."""
    source_mode = get_documents_source_mode()
    if source_mode != "postgres":
        documents_store.append(doc_meta)
        return None

    dsn = os.getenv("POSTGRES_DOCUMENTS_DSN") or os.getenv("DATABASE_URL")
    if not dsn:
        return "Missing POSTGRES_DOCUMENTS_DSN or DATABASE_URL"
    if dsn.startswith("postgresql+"):
        dsn = "postgresql://" + dsn.split("://", 1)[1]

    project_id = os.getenv("POSTGRES_DOCUMENTS_PROJECT_ID", "00000000-0000-0000-0000-000000000000")
    source_type = doc_meta.get("type", "upload")

    try:
        psycopg = importlib.import_module("psycopg")
    except Exception:
        return "psycopg is not installed in this environment"

    query = """
        INSERT INTO documents (id, project_id, file_name, source_type, status, chunk_count, is_deleted, created_at, updated_at)
        VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s, false, now(), now())
    """

    try:
        with psycopg.connect(dsn) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    query,
                    (
                        doc_meta.get("id"),
                        project_id,
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


def update_document_status(doc_id: str, status: str, error_message: Optional[str] = None) -> Optional[str]:
    """Update document status in configured source and return an optional error."""
    source_mode = get_documents_source_mode()
    if source_mode != "postgres":
        for d in documents_store:
            if d["id"] == doc_id:
                d["status"] = status
                if error_message:
                    d["error"] = error_message
                break
        return None

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
            updated_at = now(),
            ingested_at = CASE WHEN %s = 'active' THEN now() ELSE ingested_at END
        WHERE id = %s::uuid
    """

    try:
        with psycopg.connect(dsn) as conn:
            with conn.cursor() as cur:
                cur.execute(query, (db_status, db_status, doc_id))
            conn.commit()
    except Exception as e:
        return str(e)

    return None


def build_documents_inventory_answer() -> tuple[str, List[dict]]:
    """Create a direct answer and source payload from configured document metadata."""
    documents, source_mode, error = get_documents_inventory()

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
    session_id: Optional[str] = None
    project_files: Optional[List[str]] = None


class SettingsUpdate(BaseModel):
    llm_provider: Optional[str] = None
    llm_model: Optional[str] = None
    embeddings_provider: Optional[str] = None
    embeddings_model: Optional[str] = None


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


# ─── Chat Endpoints ─────────────────────────────────────────────────
@app.post("/api/chat")
async def chat(request: ChatRequest):
    """
    Chat endpoint with RAG retrieval.
    Returns a streaming response that sends tokens progressively.
    """
    session_id = request.session_id or str(uuid.uuid4())

    if session_id not in chat_sessions:
        chat_sessions[session_id] = []

    chat_sessions[session_id].append({
        "role": "user",
        "content": request.message,
    })
    save_chat_sessions_to_disk()

    async def generate():
        try:
            # Handle document inventory intent directly from metadata store.
            if is_documents_intent(request.message):
                answer, sources = build_documents_inventory_answer()
                yield f"data: {json.dumps({'type': 'sources', 'data': sources})}\n\n"

                for line in answer.split("\n"):
                    chunk = line + "\n"
                    yield f"data: {json.dumps({'type': 'token', 'data': chunk})}\n\n"
                    await asyncio.sleep(0)

                chat_sessions[session_id].append({
                    "role": "assistant",
                    "content": answer,
                    "sources": sources,
                })
                save_chat_sessions_to_disk()

                yield f"data: {json.dumps({'type': 'done', 'data': session_id})}\n\n"
                return

            # 1) Retrieve relevant chunks
            # 1) Retrieve relevant chunks
            vs = get_vector_store()
            broad_query = is_broad_concept_question(request.message)
            retrieve_k = max(RAG_TOP_K, 6) if broad_query else RAG_TOP_K

            project_files = normalize_project_files(request.project_files)

            if project_files:
                db = vs.load_or_create()
                all_results = db.get(include=["documents", "metadatas"])
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
                    },
                )
                retrieval_queries = [request.message]
                if broad_query:
                    retrieval_queries.append(f"{request.message} in context of uploaded documents")

                chunks = []
                for q in retrieval_queries:
                    chunks.extend(await asyncio.to_thread(retriever.invoke, q))

            chunks = dedupe_chunks(chunks)

            if not chunks:
                answer = build_no_project_content_response(project_files) if project_files else "I couldn't find relevant content to answer your question."
                yield f"data: {json.dumps({'type': 'sources', 'data': []})}\n\n"
                yield f"data: {json.dumps({'type': 'token', 'data': answer})}\n\n"
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
            chat_sessions[session_id].append({
                "role": "assistant",
                "content": full_response,
                "sources": sources,
            })
            save_chat_sessions_to_disk()

            yield f"data: {json.dumps({'type': 'done', 'data': session_id})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'data': format_chat_error(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.get("/api/chat/sessions")
async def list_sessions():
    """List all chat sessions."""
    sessions = []
    for sid, messages in chat_sessions.items():
        first_msg = next((m for m in messages if m["role"] == "user"), None)
        sessions.append({
            "id": sid,
            "title": first_msg["content"][:50] + "..." if first_msg else "New Chat",
            "message_count": len(messages),
        })
    return {"sessions": sessions}


@app.get("/api/chat/sessions/{session_id}")
async def get_session(session_id: str):
    """Get messages for a specific session."""
    if session_id not in chat_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"session_id": session_id, "messages": chat_sessions[session_id]}


@app.delete("/api/chat/sessions/{session_id}")
async def delete_session(session_id: str):
    """Delete a chat session."""
    if session_id in chat_sessions:
        del chat_sessions[session_id]
        save_chat_sessions_to_disk()
    return {"status": "deleted"}


# ─── Document Endpoints ─────────────────────────────────────────────
@app.post("/api/documents/upload")
async def upload_document(file: UploadFile = File(...)):
    import traceback
    try:
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
                await asyncio.to_thread(run_complete_ingestion_pipeline, str(file_path), vs, fr, original_filename)
                await asyncio.to_thread(vs.persist)

                # ← Force reload so chat retriever picks up new documents
                _vector_store = None

                await asyncio.to_thread(update_document_status, doc_id, "completed")
                print(f"✅ Ingestion complete: {original_filename}")
            except Exception as e:
                print(f"❌ Ingestion failed for {original_filename}: {e}")
                import traceback
                traceback.print_exc()
                await asyncio.to_thread(update_document_status, doc_id, "failed", str(e))

        asyncio.create_task(process())
        print(f"🚀 Background task created for: {original_filename}")  # ← ADD
        return {"document": doc_meta}

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Upload endpoint crashed: {e}")  # ← ADD
        traceback.print_exc()                       # ← ADD
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/documents")
async def list_documents():
    """List all uploaded documents with their status."""
    documents, source_mode, error = get_documents_inventory()
    response: dict[str, Any] = {"documents": documents, "source": source_mode}
    if error:
        response["error"] = error
    return response


@app.delete("/api/documents/{doc_id}")
async def delete_document(doc_id: str):
    """Delete a document record."""
    source_mode = get_documents_source_mode()
    if source_mode == "postgres":
        dsn = os.getenv("POSTGRES_DOCUMENTS_DSN") or os.getenv("DATABASE_URL")
        if dsn:
            if dsn.startswith("postgresql+"):
                dsn = "postgresql://" + dsn.split("://", 1)[1]
            try:
                psycopg = importlib.import_module("psycopg")
                with psycopg.connect(dsn) as conn:
                    with conn.cursor() as cur:
                        cur.execute(
                            "UPDATE documents SET is_deleted = true, deleted_at = now(), updated_at = now() WHERE id = %s::uuid",
                            (doc_id,),
                        )
                    conn.commit()
            except Exception:
                raise HTTPException(status_code=500, detail="Failed to delete document in postgres")
    else:
        global documents_store
        documents_store = [d for d in documents_store if d["id"] != doc_id]
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
