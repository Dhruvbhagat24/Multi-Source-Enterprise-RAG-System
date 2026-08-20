"""Create the verified RAG evaluation corpus through the production ingestion path."""

from __future__ import annotations

import asyncio
import os
import sys
import uuid
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

load_dotenv()

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
if str(REPOSITORY_ROOT) not in sys.path:
    sys.path.insert(0, str(REPOSITORY_ROOT))

# The production schema stores document project_id as UUID, while the project
# snapshot table stores the same identifier as text.
EVALUATION_EMAIL = "rag-evaluation@example.invalid"
EVALUATION_PROJECT_ID = "4d2d6e9c-7c5f-4b31-9c83-4d10c4b6df38"
FIXTURES = (
    "Finance_sheet.xlsx",
    "SOP_Maintenance.docx",
    "SwiftIQ_Innovations_LLP_NDA_Dhruv_Bhagat.docx",
)


def _fixture_path(filename: str) -> Path:
    for directory in (Path("docs"), Path("uploads")):
        candidate = directory / filename
        if candidate.is_file():
            return candidate
        prefixed_matches = sorted(directory.glob(f"*_{filename}"))
        if prefixed_matches:
            return prefixed_matches[0]
    raise FileNotFoundError(f"Evaluation fixture not found: {filename}")


def _find_or_create_evaluation_user(api: Any) -> dict[str, str]:
    user = api.find_user_by_email(EVALUATION_EMAIL)
    if user:
        return {"id": str(user["id"]), "email": str(user["email"])}
    created = api.create_user(EVALUATION_EMAIL)
    return {"id": str(created["id"]), "email": str(created["email"])}


def _ensure_evaluation_project(api: Any, user_id: str) -> None:
    payload = api.ProjectsSyncRequest(
        user_id=user_id,
        projects=[
            {
                "id": EVALUATION_PROJECT_ID,
                "name": "RAG Evaluation Fixtures",
                "files": [{"name": filename} for filename in FIXTURES],
                "docCount": len(FIXTURES),
                "chats": [],
            }
        ],
    )
    token = f"Bearer {api.issue_access_token(user_id)}"
    asyncio.run(api.sync_projects(payload, authorization=token))


def _existing_document(api: Any, user_id: str, filename: str) -> dict[str, Any] | None:
    dsn = os.getenv("POSTGRES_DOCUMENTS_DSN") or os.getenv("DATABASE_URL")
    if not dsn:
        raise RuntimeError("POSTGRES_DOCUMENTS_DSN or DATABASE_URL is required")

    import psycopg

    with psycopg.connect(dsn, row_factory=psycopg.rows.dict_row) as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT id::text AS id, project_id::text AS project_id, status, is_deleted
                FROM documents
                WHERE user_id = %s::uuid AND file_name = %s AND is_deleted = false
                ORDER BY created_at DESC
                """,
                (user_id, filename),
            )
            rows = cursor.fetchall()

    if len(rows) > 1:
        raise RuntimeError(
            f"Multiple active records exist for {filename}; refusing to guess which record to rebuild"
        )
    return dict(rows[0]) if rows else None


def _verify_vectors(api: Any, user_id: str, source_id: str, filename: str) -> tuple[int, bool]:
    database = api.get_vector_store().load_or_create()
    result = database.get(
        where={
            "$and": [
                {"user_id": user_id},
                {"source_id": source_id},
                {"source_file": filename},
            ]
        },
        include=["metadatas"],
    )
    metadatas = result.get("metadatas") or []
    deterministic = bool(metadatas) and all(
        metadata.get("chunk_id") and metadata.get("content_hash")
        for metadata in metadatas
    )
    return len(metadatas), deterministic


def setup() -> None:
    # This environment setting is consumed by the existing production document
    # record function; it is intentionally process-local and never persisted.
    os.environ["POSTGRES_DOCUMENTS_PROJECT_ID"] = EVALUATION_PROJECT_ID

    import api_server as api
    from ingestion import run_complete_ingestion_pipeline

    user = _find_or_create_evaluation_user(api)
    _ensure_evaluation_project(api, user["id"])
    vector_store = api.get_vector_store()
    file_router = api.get_file_router()

    print(f"evaluation_user_id={user['id']}")
    print(f"evaluation_project_id={EVALUATION_PROJECT_ID}")

    for filename in FIXTURES:
        path = _fixture_path(filename)
        existing = _existing_document(api, user["id"], filename)
        source_id = str(existing["id"]) if existing else str(uuid.uuid4())

        if existing and existing["project_id"] != EVALUATION_PROJECT_ID:
            raise RuntimeError(
                f"Existing document {filename} belongs to project {existing['project_id']}, "
                f"not evaluation project {EVALUATION_PROJECT_ID}"
            )

        existing_vector_count, has_deterministic_identity = _verify_vectors(
            api, user["id"], source_id, filename
        )
        if existing and existing["status"] == "active" and has_deterministic_identity:
            print(f"SKIP {filename}: active record with {existing_vector_count} indexed chunks")
            continue
        if existing and existing_vector_count:
            print(f"UPGRADE {filename}: replacing {existing_vector_count} legacy chunks")

        if existing:
            cleanup_error = api.delete_vectors_for_document(source_id, filename)
            if cleanup_error:
                raise RuntimeError(f"Unable to clean partial vectors for {filename}: {cleanup_error}")
            api.update_document_status(source_id, "processing", None, None)
        else:
            create_error = api.create_document_record(
                {
                    "id": source_id,
                    "filename": filename,
                    "size": path.stat().st_size,
                    "status": "processing",
                    "type": "application/octet-stream",
                    "user_id": user["id"],
                }
            )
            if create_error:
                raise RuntimeError(f"Unable to create document record for {filename}: {create_error}")

        chunk_count = run_complete_ingestion_pipeline(
            str(path),
            vector_store,
            file_router,
            filename,
            source_id,
            user["id"],
        )
        vector_store.persist()
        status_error = api.update_document_status(source_id, "completed", None, chunk_count)
        if status_error:
            raise RuntimeError(f"Unable to mark {filename} completed: {status_error}")

        indexed_count, has_deterministic_identity = _verify_vectors(
            api, user["id"], source_id, filename
        )
        if indexed_count != chunk_count:
            raise RuntimeError(
                f"Indexed chunk count mismatch for {filename}: pipeline={chunk_count}, chroma={indexed_count}"
            )
        if not has_deterministic_identity:
            raise RuntimeError(f"Deterministic metadata missing after ingest for {filename}")
        print(f"DONE {filename}: source_id={source_id} chunks={indexed_count}")


if __name__ == "__main__":
    setup()
