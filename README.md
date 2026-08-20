# Multi-Source Enterprise RAG System

A maintainable portfolio-scale RAG application for uploading PDF, DOCX, CSV, and XLSX files, indexing them into a persistent Chroma store, and asking source-aware questions through a streaming Next.js interface.

![Project Overview](https://img.shields.io/badge/Architecture-Multi--Tenant-blueviolet)
![Tech Stack](https://img.shields.io/badge/Tech-Next.js%20%7C%20FastAPI%20%7C%20ChromaDB-blue)

## Architecture

```mermaid
flowchart LR
	Browser[Next.js + NextAuth] -->|Bearer token| API[FastAPI]
	API --> PG[(PostgreSQL metadata)]
	API --> Redis[(Redis cache and queue)]
	Redis --> Worker[Ingestion worker]
	Worker --> Parser[PDF/DOCX/Sheet parsers]
	Parser --> Chunk[Title chunks or spreadsheet rows]
	Chunk --> Embed[Configured embeddings]
	Embed --> Chroma[(Persistent ChromaDB)]
	API -->|MMR retrieval| Chroma
	API --> LLM[Configured LLM provider]
	API -->|SSE tokens, sources, status| Browser
```

The application is intentionally a modular monolith. PostgreSQL is the system of record for users, documents, projects, conversations, messages, queries, responses, and settings. Chroma stores vectors and chunk metadata. Redis is optional for local fallback but is required for the separate ingestion worker path.

## Request and Ingestion Flows

Query flow:

`Browser -> FastAPI auth check -> PostgreSQL conversation -> Chroma user-scoped retrieval -> context prompt -> LLM -> SSE sources/tokens -> PostgreSQL response`

Ingestion flow:

`Upload -> extension/size/empty validation -> PostgreSQL processing row -> Redis queue or local task -> parser -> title-aware chunks/rows -> embeddings -> Chroma -> PostgreSQL status and chunk count`

## Technology Choices

- **FastAPI**: typed HTTP boundary with streaming support.
- **PostgreSQL**: durable relational data and ownership constraints.
- **ChromaDB**: simple persistent single-node vector storage suitable for a portfolio deployment.
- **Redis**: response cache and ingestion queue when a worker is deployed.
- **Next.js/NextAuth**: authenticated UI and streaming chat experience.
- **Provider factory**: keeps model choices in configuration.

Chroma is not being presented as a horizontally scalable enterprise vector platform. A larger deployment should move vectors to a managed or server-backed store only when traffic, availability, or operational requirements justify it.

## Key Features

- **NotebookLM-Inspired Workspace**: Organize your research into dedicated projects with a tabbed interface for managing sources and conversations.
- **Multi-Tenant Isolation**: Robust data scoping ensures that projects, documents, and chat histories are strictly isolated per user.
- **Advanced RAG Pipeline**: Provider-agnostic integration with support for Ollama (local) and OpenAI (cloud) models.
- **Intelligent Citations**: Every response includes verifiable source citations with metadata tracking back to the specific ingested document.
- **Real-time Streaming**: Fluid, low-latency chat interface with animated thinking states and progressive token rendering.
- **Premium UI/UX**: Built with React, Tailwind CSS, and Framer Motion for a modern, glassmorphic aesthetic.

## Technical Stack

### Frontend
- **Framework**: Next.js 14 (App Router)
- **State Management**: Context API with local persistence
- **Authentication**: NextAuth.js
- **Animations**: Framer Motion
- **Styling**: Tailwind CSS & Vanilla CSS

### Backend
- **Core**: FastAPI (Python 3.10+)
- **Vector Store**: ChromaDB
- **Database**: PostgreSQL (User data & Metadata)
- **AI Orchestration**: LangChain
- **Processing**: Tika / PyPDF / Unstructured for document parsing

## Prerequisites

- **Python 3.10+**
- **Node.js 18+**
- **Ollama** (for local LLM execution)
- **PostgreSQL** (Required for users, documents metadata, projects, conversations, queries, messages, responses, and application metadata)

## Local Setup

### 1. Clone the Repository
```bash
git clone https://github.com/Dhruvbhagat24/Multi-Source-Enterprise-RAG-System.git
cd Multi-Source-Enterprise-RAG-System
```

### 2. Backend Setup
```bash
# Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure PostgreSQL and model settings in .env
# DATABASE_URL=postgresql://user:password@localhost:5432/ragdb
# NEXTAUTH_SECRET=replace-with-a-long-random-value
# ACCESS_TOKEN_SECRET=replace-with-a-different-long-random-value
# INTERNAL_AUTH_SECRET=shared-secret-used-only-by-NextAuth-OAuth-bridge
# ADMIN_USER_ID=administrator-user-uuid
# CORS_ORIGINS=http://localhost:3000
# LLM_PRIMARY_PROVIDER=ollama
# LLM_PRIMARY_MODEL=llama3
# EMBEDDINGS_DEFAULT_PROVIDER=hf
# EMBEDDINGS_DEFAULT_MODEL=all-MiniLM-L6-v2
# MAX_UPLOAD_BYTES=26214400

# Start the API server
python api_server.py
```

### 3. Frontend Setup
```bash
cd frontend

# Install dependencies
npm install

# Configure environment variables (.env.local)
# NEXT_PUBLIC_API_URL=http://localhost:8080
# NEXTAUTH_SECRET=your_secret

# Start the development server
npm run dev
```

## Database

The application performs idempotent table creation for local convenience and includes the equivalent migration in [migrations/001_postgres_persistence.sql](migrations/001_postgres_persistence.sql). Production deployments should run migrations as a release step rather than depend on application startup.

Important tables: `users`, `documents`, `projects`, `conversations`, `messages`, `queries`, `responses`, and `application_metadata`.

## API Overview

- `POST /api/auth/register`, `POST /api/auth/login`: issue backend bearer tokens.
- `GET /api/health`: lightweight process/configuration health.
- `GET /api/ready`: dependency-aware readiness probe.
- `POST /api/chat`: authenticated SSE chat with sources and completion events.
- `GET /api/chat/sessions`: list owned conversations.
- `POST /api/documents/upload`: authenticated multipart upload.
- `GET /api/documents`: list owned document metadata.
- `GET /api/documents/status/{id}`: authenticated ingestion status.
- `DELETE /api/documents/{id}`: soft-delete metadata and remove vectors.
- `GET/PUT /api/projects`: authenticated project snapshots.

All user-scoped routes require a bearer token whose subject matches the requested user UUID. CORS is configured through `CORS_ORIGINS`; wildcard origins are not used by default.

## Testing and Evaluation

Focused API regression tests can run without pytest:

```powershell
python -m unittest -v tests.test_api_security
```

Frontend checks:

```powershell
Push-Location frontend
npm run lint
npm run build
Pop-Location
```

The initial RAG evaluation cases live in [evaluation/rag_cases.json](evaluation/rag_cases.json). They cover direct facts, multi-document synthesis, no-answer behavior, ambiguity, irrelevant questions, and prompt-injection content. The current repository does not yet automate LLM-judge or ground-truth scoring.

## Deployment

The current deployment scripts target a single EC2 host with systemd Redis, tmux, a Python virtual environment, FastAPI, and a worker. They are useful for a demo host but do not start the frontend, provide TLS, or supervise all processes robustly. Use `/api/ready` for a reverse proxy or process supervisor health check.

There is currently no Dockerfile, Compose definition, or CI workflow. Adding those is a worthwhile next step for reproducibility, but it was deliberately not introduced as part of the focused hardening changes because the repository has no existing container contract to preserve.

## Security and Limitations

- Backend identity is verified with a signed, expiring bearer token.
- Uploaded filenames are reduced to basenames and limited to supported extensions.
- Uploads are capped by `MAX_UPLOAD_BYTES` and rejected when empty.
- Request IDs are returned as `X-Request-ID` and request duration/status are logged.
- Uploaded document text must be treated as untrusted input; stronger prompt-injection defense remains follow-up work.
- PostgreSQL connection pooling, rate limiting, malware scanning, object storage, distributed vector storage, Docker, and CI are not yet implemented.

Highest-value next steps are deterministic chunk IDs and duplicate handling, score thresholds/reranking, automated evaluation scoring, connection pooling, Docker/CI, and deployment behind TLS with a process supervisor.

## 🛡️ Data Isolation Architecture

PostgreSQL is the system of record for all application metadata and durable user data. ChromaDB stores document chunks, embeddings, and vector indexes only. Redis is used only for response caching and background ingestion jobs.

The system implements a cascading multi-tenant scoping logic:
1. **User Scope**: Users must authenticate to access any data.
2. **Project Scope**: Documents are uploaded and indexed under specific `project_id` tags.
3. **Retrieval Scope**: The RAG pipeline filters vector searches by `user_id` and `project_id` at the database level, preventing any cross-tenant data leakage.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

---
*Built with ❤️ for Enterprise Intelligence.*
