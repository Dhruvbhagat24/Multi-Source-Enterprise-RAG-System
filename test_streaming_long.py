import requests
import json

url = "http://127.0.0.1:8080/api/chat"
payload = {"message": "What is AI?"}

print("Sending chat request (with 60s timeout)...")
resp = requests.post(url, json=payload, stream=True, timeout=60)

print(f"Status: {resp.status_code}")
print("\nStreaming response:")
print("-" * 60)

token_count = 0
sources_received = False

for line in resp.iter_lines():
    if line:
        try:
            if isinstance(line, bytes):
                line = line.decode()
            
            if line.startswith("data:"):
                json_str = line[6:].strip()
                event = json.loads(json_str)
                event_type = event.get("type")
                
                if event_type == "sources":
                    sources = event.get("data", [])
                    print(f"[SOURCES] Received {len(sources)} source(s)")
                    sources_received = True
                elif event_type == "token":
                    token = event.get("data", "")
                    print(token, end="", flush=True)
                    token_count += 1
                elif event_type == "done":
                    session_id = event.get("data")
                    print(f"\n\n[DONE] Session ID: {session_id}")
                elif event_type == "error":
                    error = event.get("data")
                    print(f"[ERROR] {error}")
        except Exception as e:
            print(f"Error parsing: {e}")

print(f"\n\n--- Summary ---")
print(f"Sources received: {sources_received}")
print(f"Tokens streamed: {token_count}")
