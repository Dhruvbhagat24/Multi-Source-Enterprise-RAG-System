#!/bin/bash
# ─── Stop All Services ──────────────────────────────────────────────
# Usage: chmod +x stop.sh && ./stop.sh

echo "⏹  Stopping RAG System..."

tmux kill-session -t rag 2>/dev/null && echo "✅ tmux session 'rag' terminated" || echo "ℹ️  No active session found"

echo ""
echo "💡 Redis is still running (managed by systemd)."
echo "   To stop Redis too: sudo systemctl stop redis-server"
echo ""
echo "🔴 Remember to STOP your EC2 instance in AWS Console to avoid charges!"
