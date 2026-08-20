from api_server import app
from fastapi.testclient import TestClient
import json, time, os

client = TestClient(app)
user_id = os.environ["TEST_USER_ID"]

with open("uploads/test_upload.txt", "rb") as f:
    files = {"file": ("test_upload.txt", f, "text/plain")}
    data = {"user_id": user_id}
    resp = client.post("/api/documents/upload", data=data, files=files)
    print("POST /api/documents/upload ->", resp.status_code)
    try:
        print(resp.json())
    except Exception:
        print(resp.text)

# Allow the background ingestion job a moment to update PostgreSQL metadata
time.sleep(1)

# Fetch documents list
resp2 = client.get("/api/documents", params={"user_id": user_id})
print("GET /api/documents ->", resp2.status_code)
try:
    print(json.dumps(resp2.json(), indent=2))
except Exception:
    print(resp2.text)
