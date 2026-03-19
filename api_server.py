"""
FastAPI server wrapping the existing RAG system.
Provides endpoints for chat, document management, and settings.
"""
import os
import json
import uuid
import asyncio
import shutil
from typing import List, Optional
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

RAG_TOP_K = int(os.getenv("RAG_TOP_K", "2"))
RAG_CHUNK_CHARS = int(os.getenv("RAG_CHUNK_CHARS", "700"))
RAG_MAX_CONTEXT_CHARS = int(os.getenv("RAG_MAX_CONTEXT_CHARS", "1600"))


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


# ─── Pydantic Models ────────────────────────────────────────────────
class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str
    sources: Optional[List[dict]] = None


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None


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
            # 1) Retrieve relevant chunks
            vs = get_vector_store()
            retriever = vs.as_retriever(search_kwargs={"k": RAG_TOP_K})
            chunks = await asyncio.to_thread(retriever.invoke, request.message)

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

            prompt = f"""Answer the user's question using only the provided context.
If context is insufficient, say that clearly in one line.
Keep the answer concise and actionable.

CONTEXT:
{context}

QUESTION: {request.message}"""

            llm = get_llm()

            # 3) Stream the actual model output as it is generated.
            full_response = ""
            for token in llm.stream([HumanMessage(content=prompt)]):
                full_response += token
                yield f"data: {json.dumps({'type': 'token', 'data': token})}\n\n"
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
            yield f"data: {json.dumps({'type': 'error', 'data': str(e)})}\n\n"

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
    """Upload and ingest a document into the vector store."""
    doc_id = str(uuid.uuid4())
    file_path = UPLOAD_DIR / file.filename

    # Save file
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)

    # Copy to docs dir too
    shutil.copy2(str(file_path), str(DOCS_DIR / file.filename))

    doc_meta = {
        "id": doc_id,
        "filename": file.filename,
        "size": len(content),
        "status": "processing",
        "type": file.content_type or "unknown",
    }
    documents_store.append(doc_meta)

    # Process asynchronously
    async def process():
        try:
            from ingestion import run_complete_ingestion_pipeline
            vs = get_vector_store()
            fr = get_file_router()

            # Run heavy ingestion work off the event loop so chat/doc endpoints
            # remain responsive while files are being processed.
            await asyncio.to_thread(run_complete_ingestion_pipeline, str(file_path), vs, fr)
            await asyncio.to_thread(vs.persist)

            # Update status
            for d in documents_store:
                if d["id"] == doc_id:
                    d["status"] = "completed"
                    break
        except Exception as e:
            for d in documents_store:
                if d["id"] == doc_id:
                    d["status"] = "failed"
                    d["error"] = str(e)
                    break

    asyncio.create_task(process())

    return {"document": doc_meta}


@app.get("/api/documents")
async def list_documents():
    """List all uploaded documents with their status."""
    return {"documents": documents_store}


@app.delete("/api/documents/{doc_id}")
async def delete_document(doc_id: str):
    """Delete a document record."""
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
