#!/usr/bin/env python
"""
Comprehensive smoke test for RAG system.
Tests health, documents, chat streaming, and module availability.
"""
import requests
import json
import time
from pathlib import Path

BASE_URL = "http://127.0.0.1:8080"
TESTS_PASSED = 0
TESTS_FAILED = 0

def log_test(name: str, passed: bool, message: str = ""):
    global TESTS_PASSED, TESTS_FAILED
    status = "[PASS]" if passed else "[FAIL]"
    print(f"{status} {name}")
    if message:
        print(f"  → {message}")
    if passed:
        TESTS_PASSED += 1
    else:
        TESTS_FAILED += 1
    if message:
        print(f"  → {message}")
    if passed:
        TESTS_PASSED += 1
    else:
        TESTS_FAILED += 1

print("\n" + "="*60)
print("RAG SYSTEM SMOKE TEST")
print("="*60 + "\n")

# Test 1: Health Check
print("TEST 1: Backend Health & System Status")
print("-" * 60)
try:
    resp = requests.get(f"{BASE_URL}/api/health", timeout=5)
    if resp.status_code == 200:
        data = resp.json()
        log_test(
            "Health endpoint",
            data.get("status") == "operational",
            f"Status: {data.get('status')}"
        )
        
        components = data.get("components", {})
        for comp_name, comp_data in components.items():
            status = comp_data.get("status", "unknown")
            log_test(
                f"  {comp_name}",
                status in ["configured", "connected"],
                f"Status: {status}"
            )
    else:
        log_test("Health endpoint", False, f"Status code: {resp.status_code}")
except Exception as e:
    log_test("Health endpoint", False, str(e))

# Test 2: Settings
print("\nTEST 2: Settings & Configuration")
print("-" * 60)
try:
    resp = requests.get(f"{BASE_URL}/api/settings", timeout=5)
    if resp.status_code == 200:
        data = resp.json()
        llm_provider = data.get("llm", {}).get("provider")
        embeddings_provider = data.get("embeddings", {}).get("provider")
        
        log_test(
            "Settings retrieval",
            all([llm_provider, embeddings_provider]),
            f"LLM: {llm_provider}, Embeddings: {embeddings_provider}"
        )
        
        available_llm = data.get("available_providers", {}).get("llm", [])
        available_emb = data.get("available_providers", {}).get("embeddings", [])
        log_test(
            "Provider options",
            len(available_llm) > 0 and len(available_emb) > 0,
            f"LLM options: {len(available_llm)}, Embedding options: {len(available_emb)}"
        )
    else:
        log_test("Settings retrieval", False, f"Status code: {resp.status_code}")
except Exception as e:
    log_test("Settings retrieval", False, str(e))

# Test 3: Documents
print("\nTEST 3: Document Management")
print("-" * 60)
try:
    resp = requests.get(f"{BASE_URL}/api/documents", timeout=5)
    if resp.status_code == 200:
        data = resp.json()
        doc_count = len(data.get("documents", []))
        log_test(
            "Documents list endpoint",
            True,
            f"Found {doc_count} documents"
        )
    else:
        log_test("Documents list endpoint", False, f"Status code: {resp.status_code}")
except Exception as e:
    log_test("Documents list endpoint", False, str(e))

# Test 4: Chat Sessions
print("\nTEST 4: Chat Session Management")
print("-" * 60)
try:
    resp = requests.get(f"{BASE_URL}/api/chat/sessions", timeout=5)
    if resp.status_code == 200:
        data = resp.json()
        session_count = len(data.get("sessions", []))
        log_test(
            "Chat sessions list",
            True,
            f"Found {session_count} sessions"
        )
    else:
        log_test("Chat sessions list", False, f"Status code: {resp.status_code}")
except Exception as e:
    log_test("Chat sessions list", False, str(e))

# Test 5: Chat Streaming
print("\nTEST 5: Chat Streaming")
print("-" * 60)
try:
    start_time = time.time()
    resp = requests.post(
        f"{BASE_URL}/api/chat",
        json={"message": "What is artificial intelligence?"},
        timeout=15,
        stream=True
    )
    
    if resp.status_code == 200:
        events = []
        token_count = 0
        has_sources = False
        has_tokens = False
        has_done = False
        
        for line in resp.iter_lines():
            if line and line.startswith(b"data:"):
                try:
                    json_str = line[6:].decode()
                    event = json.loads(json_str)
                    event_type = event.get("type")
                    
                    if event_type == "sources":
                        has_sources = True
                    elif event_type == "token":
                        has_tokens = True
                        token_count += 1
                    elif event_type == "done":
                        has_done = True
                    elif event_type == "error":
                        break
                except:
                    pass
        
        elapsed = time.time() - start_time
        log_test(
            "Chat streaming initiated",
            resp.status_code == 200,
            f"Received sources: {has_sources}, tokens: {token_count}, completed: {has_done}"
        )
        log_test(
            "Source retrieval",
            has_sources,
            "Sources sent in stream"
        )
        log_test(
            "Token streaming",
            has_tokens and token_count > 0,
            f"Streamed {token_count} tokens in {elapsed:.2f}s"
        )
        log_test(
            "Completion signal",
            has_done,
            "Chat completed successfully"
        )
    else:
        log_test("Chat streaming initiated", False, f"Status code: {resp.status_code}")
except Exception as e:
    log_test("Chat streaming initiated", False, str(e))

# Test 6: Verify new session was created
print("\nTEST 6: Session Persistence")
print("-" * 60)
try:
    resp = requests.get(f"{BASE_URL}/api/chat/sessions", timeout=5)
    if resp.status_code == 200:
        data = resp.json()
        session_count = len(data.get("sessions", []))
        log_test(
            "New session created",
            session_count > 0,
            f"Now have {session_count} session(s)"
        )
    else:
        log_test("Session verification", False, f"Status code: {resp.status_code}")
except Exception as e:
    log_test("Session verification", False, str(e))

# Summary
print("\n" + "="*60)
print(f"RESULTS: {TESTS_PASSED} passed, {TESTS_FAILED} failed")
print("="*60 + "\n")

if TESTS_FAILED == 0:
    print("[PASS] All smoke tests passed! System is operational.")
else:
    print(f"[FAIL] {TESTS_FAILED} test(s) failed. Review output above.")
