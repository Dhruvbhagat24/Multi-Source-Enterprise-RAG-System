"""Evaluate chunk-level Recall@K using the production retrieval path."""

from __future__ import annotations

import asyncio
import json
import sys
import time
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

load_dotenv()

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
if str(REPOSITORY_ROOT) not in sys.path:
    sys.path.insert(0, str(REPOSITORY_ROOT))

EVALUATION_USER_ID = "265137bb-2f73-44bd-b596-1bc44df664f1"
EVALUATION_PROJECT_ID = "4d2d6e9c-7c5f-4b31-9c83-4d10c4b6df38"
CASES_PATH = REPOSITORY_ROOT / "evaluation" / "rag_cases.json"
EVALUATION_CASE_IDS = {"direct_fact", "multi_chunk", "ambiguous"}
RECALL_K_VALUES = (1, 3, 5)


def load_verified_cases() -> list[dict[str, Any]]:
    cases = json.loads(CASES_PATH.read_text(encoding="utf-8"))
    verified = [
        case
        for case in cases
        if case.get("id") in EVALUATION_CASE_IDS and case.get("expected_chunks")
    ]
    found_ids = {case.get("id") for case in verified}
    missing = EVALUATION_CASE_IDS - found_ids
    if missing:
        raise RuntimeError(f"Missing verified evaluation cases: {sorted(missing)}")
    if len(verified) != len(EVALUATION_CASE_IDS):
        raise RuntimeError("Evaluation case IDs are not unique")
    return verified


def extract_chunk_id(chunk: Any) -> str | None:
    metadata = getattr(chunk, "metadata", {}) or {}
    if isinstance(metadata, dict):
        chunk_id = str(metadata.get("chunk_id") or "").strip()
        if chunk_id:
            return chunk_id
    chunk_id = getattr(chunk, "id", None)
    if chunk_id:
        return str(chunk_id).strip()
    return None


def verify_scope(api: Any) -> tuple[tuple[set[str], set[str], dict[str, set[str]]], list[dict[str, Any]]]:
    documents, source_mode, error = api.get_documents_inventory(EVALUATION_USER_ID)
    if error:
        raise RuntimeError(f"Unable to load evaluation documents from {source_mode}: {error}")

    expected_files = {
        filename.lower()
        for case in load_verified_cases()
        for filename in case["expected_sources"]
    }
    owned_documents = [
        document
        for document in documents
        if str(document.get("filename", "")).strip().lower() in expected_files
    ]
    missing = expected_files - {
        str(document.get("filename", "")).strip().lower()
        for document in owned_documents
    }
    if missing:
        raise RuntimeError(f"Evaluation sources missing for user {EVALUATION_USER_ID}: {sorted(missing)}")
    if any(str(document.get("status", "")).lower() != "completed" for document in owned_documents):
        raise RuntimeError("At least one evaluation document is not completed")

    dsn = api.os.getenv("POSTGRES_DOCUMENTS_DSN") or api.os.getenv("DATABASE_URL")
    if not dsn:
        raise RuntimeError("POSTGRES_DOCUMENTS_DSN or DATABASE_URL is required")

    import psycopg

    with psycopg.connect(dsn, row_factory=psycopg.rows.dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT file_name, project_id::text AS project_id
                FROM documents
                WHERE user_id = %s::uuid
                  AND file_name = ANY(%s)
                  AND is_deleted = false
                """,
                (EVALUATION_USER_ID, sorted(expected_files)),
            )
            rows = cursor.fetchall()

    wrong_project = [
        dict(row)
        for row in rows
        if str(row["project_id"]) != EVALUATION_PROJECT_ID
    ]
    if wrong_project:
        raise RuntimeError(f"Evaluation documents are outside the requested project: {wrong_project}")

    scope = api.get_active_documents_scope(EVALUATION_USER_ID)
    if scope is None:
        raise RuntimeError("Active evaluation document scope is unavailable")
    return scope, owned_documents


def evaluate_case(api: Any, vector_store: Any, scope: Any, case: dict[str, Any]) -> dict[str, Any]:
    expected_chunk_ids = [
        str(item["chunk_id"]).strip()
        for item in case.get("expected_chunks", [])
        if str(item.get("chunk_id", "")).strip()
    ]
    if not expected_chunk_ids:
        raise RuntimeError(f"Case {case.get('id')} is missing expected chunk IDs")

    project_files = api.normalize_project_files(case.get("project_files") or case["expected_sources"])
    results_by_k: dict[str, Any] = {}
    retrieved_ids_by_k: dict[str, list[str]] = {}
    latencies: list[float] = []

    for k in RECALL_K_VALUES:
        started = time.perf_counter()
        chunks = asyncio.run(
            api.retrieve_chunks(
                vector_store=vector_store,
                query=case["question"],
                retrieve_k=k,
                broad_query=api.is_broad_concept_question(case["question"]),
                user_id=EVALUATION_USER_ID,
                project_files=project_files,
                active_scope=scope,
            )
        )
        latency_ms = round((time.perf_counter() - started) * 1000, 2)
        latencies.append(latency_ms)

        retrieved_ids = []
        seen_ids: set[str] = set()
        for chunk in chunks:
            chunk_id = extract_chunk_id(chunk)
            if not chunk_id or chunk_id in seen_ids:
                continue
            seen_ids.add(chunk_id)
            retrieved_ids.append(chunk_id)

        retrieved_ids_by_k[str(k)] = retrieved_ids[:k]
        relevant_hits = set(retrieved_ids_by_k[str(k)]) & set(expected_chunk_ids)
        recall = len(relevant_hits) / len(expected_chunk_ids) if expected_chunk_ids else 0.0

        results_by_k[str(k)] = {
            "recall": round(recall, 4),
            "retrieved_ids": retrieved_ids_by_k[str(k)],
            "expected_ids": expected_chunk_ids,
            "relevant_hit_count": len(relevant_hits),
            "latency_ms": latency_ms,
        }

    return {
        "case_id": case["id"],
        "question": case["question"],
        "expected_sources": sorted(case.get("expected_sources", [])),
        "project_files": project_files,
        "expected_chunk_ids": expected_chunk_ids,
        "retrieved_chunk_ids": retrieved_ids_by_k.get("5", []),
        "results": results_by_k,
        "mean_latency_ms": round(sum(latencies) / len(latencies), 2),
    }


def aggregate_recall(results: list[dict[str, Any]], k: int) -> float:
    case_recalls = [float(result["results"][str(k)]["recall"]) for result in results]
    return round(sum(case_recalls) / len(case_recalls), 4) if case_recalls else 0.0


def main() -> int:
    import api_server as api

    cases = load_verified_cases()
    scope, documents = verify_scope(api)
    vector_store = api.get_vector_store()
    results = [evaluate_case(api, vector_store, scope, case) for case in cases]

    aggregate = {
        str(k): {
            "mean_case_recall": aggregate_recall(results, k),
            "cases": len(results),
        }
        for k in RECALL_K_VALUES
    }

    report = {
        "evaluation_user_id": EVALUATION_USER_ID,
        "evaluation_project_id": EVALUATION_PROJECT_ID,
        "cases_evaluated": len(cases),
        "indexed_documents_verified": len(documents),
        "aggregate_recall": aggregate,
        "per_case": results,
    }
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
