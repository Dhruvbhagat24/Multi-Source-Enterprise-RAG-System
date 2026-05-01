import os
import json
import time
import asyncio
import traceback
import redis
from pathlib import Path

# Connect to Redis
redis_client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)

# Important: Load environment variables so ChromaDB and API keys work
from dotenv import load_dotenv
load_dotenv()

# We need to import the RAG pipeline components from api_server and ingestion
from api_server import get_vector_store, get_file_router, update_document_status
from ingestion import run_complete_ingestion_pipeline

print("🚀 Starting Redis Document Processing Worker...")
print("Listening for jobs on queue:documents...")

def process_job(job_payload):
    file_path = job_payload["file_path"]
    original_filename = job_payload["original_filename"]
    doc_id = job_payload["doc_id"]
    user_id = job_payload["user_id"]
    
    print(f"\n[WORKER] 📥 Picked up job for: {original_filename}")
    
    # Initialize the components required by the ingestion pipeline
    vs = get_vector_store()
    fr = get_file_router()
    
    try:
        # Run the pipeline synchronously inside the worker process
        run_complete_ingestion_pipeline(
            file_path,
            vs,
            fr,
            original_filename,
            doc_id,
            user_id
        )
        # Persist vectors to disk
        vs.persist()
        
        # Update the document status in Postgres/JSON
        update_document_status(doc_id, "completed")
        
        # Mark job as done in Redis
        redis_client.set(f"job:{doc_id}", "done")
        
        print(f"[WORKER] ✅ Ingestion complete: {original_filename}")
        
    except Exception as e:
        print(f"[WORKER] ❌ Ingestion failed for {original_filename}: {e}")
        traceback.print_exc()
        
        update_document_status(doc_id, "failed", str(e))
        redis_client.set(f"job:{doc_id}", "failed")

def main():
    while True:
        try:
            # BLPOP blocks until a job is available in the queue
            # Returns a tuple (queue_name, item)
            result = redis_client.blpop("queue:documents", timeout=0)
            if result:
                _, job_json = result
                job_payload = json.loads(job_json)
                process_job(job_payload)
        except redis.exceptions.ConnectionError:
            print("⚠️ Redis connection lost. Reconnecting in 5 seconds...")
            time.sleep(5)
        except Exception as e:
            print(f"⚠️ Error in worker loop: {e}")
            time.sleep(2)

if __name__ == "__main__":
    main()
