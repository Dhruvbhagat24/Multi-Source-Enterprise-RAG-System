#!/bin/bash
# ─── Start All Services ─────────────────────────────────────────────
# Launches Redis + FastAPI + Worker in a single tmux session
# Usage: chmod +x start.sh && ./start.sh

set -e

SESSION="rag"

# Kill existing session if any
tmux kill-session -t $SESSION 2>/dev/null || true

echo "🚀 Starting Multi-Source Enterprise RAG System..."

# Activate venv
VENV_ACTIVATE="source ~/rag-system/venv/bin/activate"
PROJECT_DIR="cd ~/rag-system"

# Ensure Redis is running
sudo systemctl start redis-server

# Create tmux session with 3 windows
tmux new-session -d -s $SESSION -n "fastapi"

# Window 1: FastAPI Server
tmux send-keys -t $SESSION:fastapi "$PROJECT_DIR && $VENV_ACTIVATE && uvicorn api_server:app --host 0.0.0.0 --port 8000" Enter

# Window 2: Background Worker
tmux new-window -t $SESSION -n "worker"
tmux send-keys -t $SESSION:worker "$PROJECT_DIR && $VENV_ACTIVATE && python worker.py" Enter

# Window 3: Monitoring
tmux new-window -t $SESSION -n "monitor"
tmux send-keys -t $SESSION:monitor "echo '═══ RAG System Monitor ═══' && echo '' && echo '📊 Redis:' && redis-cli info server | head -5 && echo '' && echo '💾 Memory:' && free -h && echo '' && echo '🔥 Services: Use Ctrl+B then 0/1/2 to switch windows' && echo '   Window 0: FastAPI' && echo '   Window 1: Worker' && echo '   Window 2: Monitor (this)' && echo '' && echo '⏹  To stop: tmux kill-session -t rag' && echo '🔌 To detach: Ctrl+B then D'" Enter

# Select FastAPI window
tmux select-window -t $SESSION:fastapi

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  ✅ All services started in tmux session 'rag'"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "  🌐 FastAPI:  http://YOUR_EC2_IP:8000"
echo "  📡 Redis:    localhost:6379"
echo "  🔧 Worker:   Running in background"
echo ""
echo "  Commands:"
echo "    tmux attach -t rag     → View live logs"
echo "    Ctrl+B then D          → Detach (keep running)"
echo "    Ctrl+B then 0/1/2      → Switch between services"
echo "    tmux kill-session -t rag → Stop everything"
echo ""
echo "═══════════════════════════════════════════════════════"

# Attach to the session
tmux attach -t $SESSION
