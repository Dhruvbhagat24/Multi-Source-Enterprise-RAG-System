# Multi-Source Enterprise RAG System

An end-to-end Retrieval-Augmented Generation (RAG) platform that ingests documents from multiple sources (PDF, DOCX, CSV/XLSX), indexes them in ChromaDB, and serves grounded answers through a streaming chat API with a modern Next.js frontend.

## Features

- Multi-source ingestion pipeline for:
  - PDF
  - DOCX
  - CSV/XLSX
- ChromaDB vector store persistence
- Provider-agnostic AI layer (Ollama/OpenAI/Hugging Face embedding flow)
- Streaming chat responses (SSE)
- Source attribution in chat answers
- Session-based chat history with disk persistence (`chat_sessions.json`)
- UI modules for Chat, Documents, and Settings

## Tech Stack

- Backend: FastAPI, LangChain, ChromaDB
- Frontend: Next.js 16, React 19, Tailwind CSS 4, Framer Motion, Three.js
- AI Providers:
  - LLM: Ollama or OpenAI
  - Embeddings: Hugging Face or OpenAI

## Project Structure

```text
api_server.py                 # FastAPI backend
core/                         # AI interfaces, factory, vector store, file routing
providers/                    # Provider-specific LLM/embedding/ingestion logic
frontend/                     # Next.js frontend
ingestion.py                  # Ingestion and chunking pipeline helpers
docs/                         # Source documents
uploads/                      # Uploaded files
chat_sessions.json            # Persisted chat history (auto-created/updated)
dbv2/chroma_db/               # Chroma persistence directory
```

## Prerequisites

- Python 3.10+
- Node.js 20+
- npm 10+

### Windows System Dependencies

See [Installing System Dependencies(WINDOWS).txt](Installing%20System%20Dependencies(WINDOWS).txt).

Recommended/required on Windows:

- Microsoft Visual C++ Redistributable (required)
- Visual Studio Build Tools (optional for some advanced parsing paths)
- Poppler (PDF tooling)
- Tesseract OCR (scanned/image text extraction)

## Installation

### 1) Clone and enter project

```powershell
git clone https://github.com/Dhruvbhagat24/Multi-Source-Enterprise-RAG-System.git
cd Multi-Source-Enterprise-RAG-System
```

### 2) Backend setup

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 3) Frontend setup

```powershell
cd frontend
npm install
cd ..
```

## Environment Variables

Create a `.env` file in the project root (same folder as `api_server.py`).

### Core

```env
LLM_PRIMARY_PROVIDER=ollama
LLM_PRIMARY_MODEL=gemma:2b
EMBEDDINGS_DEFAULT_PROVIDER=hf
EMBEDDINGS_DEFAULT_MODEL=all-MiniLM-L6-v2
```

### Ollama

```env
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_NUM_CTX=2048
OLLAMA_NUM_PREDICT=256
OLLAMA_KEEP_ALIVE=10m
```

### RAG Tuning

```env
RAG_TOP_K=2
RAG_CHUNK_CHARS=700
RAG_MAX_CONTEXT_CHARS=1600
```

### Optional PDF Ingestion Controls

```env
PDF_PARTITION_STRATEGY=fast
PDF_INFER_TABLES=false
PDF_EXTRACT_IMAGES=false
```

### Frontend API URL (optional)

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8080
```

## Run the Application

Open two terminals.

### Terminal A: Backend

```powershell
python api_server.py
```

Backend will run on:

- `http://127.0.0.1:8080`

### Terminal B: Frontend

```powershell
cd frontend
npm run dev
```

Frontend will run on:

- `http://localhost:3000`

## Quick Usage

1. Open the frontend.
2. Go to Documents and upload files.
3. Wait for ingestion status to complete.
4. Go to Chat and ask questions about your uploaded documents.
5. Open Settings to switch providers/models.

## API Endpoints

- `GET /api/health` - system and component health
- `POST /api/chat` - streaming chat endpoint (SSE)
- `GET /api/chat/sessions` - list chat sessions
- `GET /api/chat/sessions/{session_id}` - session messages
- `DELETE /api/chat/sessions/{session_id}` - delete a session
- `POST /api/documents/upload` - upload and ingest a document
- `GET /api/documents` - list uploaded document records
- `DELETE /api/documents/{doc_id}` - delete document record
- `GET /api/settings` - current model/provider settings
- `POST /api/settings` - update provider/model settings

## Chat Session Persistence

Chat sessions are persisted in `chat_sessions.json`.

- On startup, backend loads sessions from disk.
- On user/assistant message append, backend saves sessions to disk.
- On session delete, backend updates the file.

## Troubleshooting

### 1) Ollama `serve` returns port/bind error

If `ollama serve` reports a bind error, another Ollama process may already be running. Check with:

```powershell
ollama list
```

If models list successfully, use the running service and keep `OLLAMA_BASE_URL=http://127.0.0.1:11434`.

### 2) Previous chats not visible

- Confirm backend is running.
- Confirm `chat_sessions.json` exists in project root.
- Check sessions endpoint:

```powershell
Invoke-WebRequest -Uri http://127.0.0.1:8080/api/chat/sessions -Method GET | Select-Object -ExpandProperty Content
```

### 3) Frontend cannot reach backend

- Verify backend is at `127.0.0.1:8080`
- Set `NEXT_PUBLIC_API_URL` in `frontend/.env.local`
- Restart `npm run dev`

## Development Notes

- Backend currently uses local in-memory stores for documents metadata and runtime objects, with session persistence added via JSON file.
- Chroma persists under `dbv2/chroma_db`.
- Frontend chat responses are streamed token-by-token for low-latency UX.

## License

Add your preferred license in a `LICENSE` file.
