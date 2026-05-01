#!/bin/bash
# ─── AWS EC2 Setup Script ───────────────────────────────────────────
# Run this ONCE on a fresh Ubuntu 22.04 EC2 instance (t2.micro)
# Usage: chmod +x setup_ec2.sh && ./setup_ec2.sh

set -e
echo "🚀 Setting up Multi-Source Enterprise RAG System on AWS EC2..."

# ─── 1. System Updates ──────────────────────────────────────────────
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# ─── 2. Install Dependencies ────────────────────────────────────────
echo "📦 Installing Python, Redis, tmux, git..."
sudo apt install -y python3-pip python3-venv git redis-server tmux curl

# ─── 3. Create Swap File (CRITICAL for t2.micro 1GB RAM) ────────────
echo "💾 Creating 2GB swap file (prevents OOM crashes)..."
if [ ! -f /swapfile ]; then
    sudo fallocate -l 2G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    echo "✅ Swap file created and enabled"
else
    echo "ℹ️  Swap file already exists"
fi

# ─── 4. Configure Redis ─────────────────────────────────────────────
echo "⚡ Configuring Redis for low-memory environment..."
sudo tee /etc/redis/redis.conf.d/lowmem.conf > /dev/null <<EOF
maxmemory 128mb
maxmemory-policy allkeys-lru
EOF
sudo systemctl enable redis-server
sudo systemctl restart redis-server

# ─── 5. Test Redis ──────────────────────────────────────────────────
echo "🧪 Testing Redis..."
redis-cli ping

# ─── 6. Clone Project ──────────────────────────────────────────────
echo "📂 Setting up project..."
if [ ! -d ~/rag-system ]; then
    echo "⚠️  Please clone your repo manually:"
    echo "    git clone YOUR_REPO_URL ~/rag-system"
    echo "    Then re-run this script."
else
    echo "✅ Project directory found"
fi

# ─── 7. Python Virtual Environment ─────────────────────────────────
echo "🐍 Creating Python virtual environment..."
cd ~/rag-system
python3 -m venv venv
source venv/bin/activate

echo "📦 Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# ─── 8. Done ────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════"
echo "  ✅ EC2 Setup Complete!"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "  Next steps:"
echo "  1. Clone your repo:  git clone YOUR_URL ~/rag-system"
echo "  2. Create .env:      cp .env.example .env && nano .env"
echo "  3. Start the app:    ./start.sh"
echo ""
echo "  Your app will be at: http://YOUR_EC2_IP:8000"
echo "═══════════════════════════════════════════════════════"
