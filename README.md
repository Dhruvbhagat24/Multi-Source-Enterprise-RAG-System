# Multi-Source Enterprise RAG System

A high-performance, multi-tenant Retrieval-Augmented Generation (RAG) platform designed for enterprise-grade document intelligence. This system features a NotebookLM-inspired interface, allowing users to organize documents into isolated projects, chat with multiple sources simultaneously, and maintain strict data privacy across accounts.

![Project Overview](https://img.shields.io/badge/Architecture-Multi--Tenant-blueviolet)
![Tech Stack](https://img.shields.io/badge/Tech-Next.js%20%7C%20FastAPI%20%7C%20ChromaDB-blue)

## 🚀 Key Features

- **NotebookLM-Inspired Workspace**: Organize your research into dedicated projects with a tabbed interface for managing sources and conversations.
- **Multi-Tenant Isolation**: Robust data scoping ensures that projects, documents, and chat histories are strictly isolated per user.
- **Advanced RAG Pipeline**: Provider-agnostic integration with support for Ollama (local) and OpenAI (cloud) models.
- **Intelligent Citations**: Every response includes verifiable source citations with metadata tracking back to the specific ingested document.
- **Real-time Streaming**: Fluid, low-latency chat interface with animated thinking states and progressive token rendering.
- **Premium UI/UX**: Built with React, Tailwind CSS, and Framer Motion for a modern, glassmorphic aesthetic.

## 🛠️ Technical Stack

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

## 📋 Prerequisites

- **Python 3.10+**
- **Node.js 18+**
- **Ollama** (for local LLM execution)
- **PostgreSQL** (Optional, falls back to local storage)

## ⚙️ Installation & Setup

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

## 🛡️ Data Isolation Architecture

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
