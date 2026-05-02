import requests
import json

url = "http://127.0.0.1:8080/api/chat"
payload = {"message": "What is AI in simple terms?"}

print("Sending chat request...")
resp = requests.post(url, json=payload, stream=True, timeout=15)

print(f"Status: {resp.status_code}")
print(f"Headers: {dict(resp.headers)}")
print("\nStreaming response (first 20 lines):")
print("-" * 60)

line_count = 0
for line in resp.iter_lines():
    if line_count >= 20:
        break
    if line:
        print(line.decode() if isinstance(line, bytes) else line)
        line_count += 1
