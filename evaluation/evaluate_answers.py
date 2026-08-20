"""Evaluate answers through the real production /api/chat SSE endpoint."""

from __future__ import annotations

import json
import re
import sys
import time
import uuid
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi.testclient import TestClient

load_dotenv()

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
if str(REPOSITORY_ROOT) not in sys.path:
    sys.path.insert(0, str(REPOSITORY_ROOT))

EVALUATION_USER_ID = "265137bb-2f73-44bd-b596-1bc44df664f1"
EVALUATION_PROJECT_ID = "4d2d6e9c-7c5f-4b31-9c83-4d10c4b6df38"
CASES_PATH = REPOSITORY_ROOT / "evaluation" / "rag_cases.json"
CASE_IDS = ("direct_fact", "multi_chunk", "ambiguous")
RETRIEVAL_FALLBACK_PREFIX = "The configured language model is currently unavailable"


def load_verified_cases() -> list[dict[str, Any]]:
    cases = json.loads(CASES_PATH.read_text(encoding="utf-8"))
    selected = [case for case in cases if case.get("id") in CASE_IDS]
    selected_by_id = {case.get("id"): case for case in selected}
    missing = [case_id for case_id in CASE_IDS if case_id not in selected_by_id]
    if missing:
        raise RuntimeError(f"Missing verified cases: {missing}")
    return [selected_by_id[case_id] for case_id in CASE_IDS]


def cache_status(api: Any, message: str) -> str:
    """Report only cache state observable without changing production behavior."""
    redis_client = getattr(api, "redis_client", None)
    if redis_client is None:
        return "cache status unknown"

    query_hash = api.hashlib.sha256(message.strip().lower().encode()).hexdigest()
    cache_key = f"cache:{EVALUATION_USER_ID}:{EVALUATION_PROJECT_ID}:{query_hash}"
    try:
        return "cached" if redis_client.get(cache_key) else "not cached before request"
    except Exception:
        return "cache status unknown"


def parse_sse(response: Any) -> list[dict[str, Any]]:
    """Parse every data event emitted by the production streaming response."""
    events = []
    for line in response.iter_lines():
        if isinstance(line, bytes):
            line = line.decode("utf-8")
        if not line or not line.startswith("data: "):
            continue
        try:
            payload = json.loads(line[6:])
        except json.JSONDecodeError as error:
            raise RuntimeError(f"Invalid SSE JSON: {line}") from error
        if isinstance(payload, dict):
            events.append(payload)
    return events


def source_metadata(source: dict[str, Any]) -> dict[str, Any]:
    metadata = source.get("metadata") or {}
    return {
        "ordinal_id": source.get("id"),
        "chunk_id": metadata.get("chunk_id"),
        "source_id": metadata.get("source_id"),
        "source_file": metadata.get("source_file"),
        "source_type": metadata.get("source_type"),
        "user_id": metadata.get("user_id"),
        "row_index": metadata.get("row_index"),
        "chunk_index": metadata.get("chunk_index"),
        "transaction_id": metadata.get("transaction_id"),
    }


def evaluate_sources(case: dict[str, Any], sources: list[dict[str, Any]]) -> dict[str, Any]:
    expected_chunks = [
        str(item.get("chunk_id", "")).strip()
        for item in case.get("expected_chunks", [])
        if str(item.get("chunk_id", "")).strip()
    ]
    expected_sources = {
        str(source).strip().lower() for source in case.get("expected_sources", [])
    }
    retrieved = [source_metadata(source) for source in sources]
    retrieved_chunks = [str(item["chunk_id"]).strip() for item in retrieved if item.get("chunk_id")]
    retrieved_sources = {
        str(item["source_file"]).strip().lower()
        for item in retrieved
        if item.get("source_file")
    }
    unauthorized = [
        item for item in retrieved
        if item.get("user_id") not in {None, EVALUATION_USER_ID}
    ]
    unexpected_sources = sorted(retrieved_sources - expected_sources)
    return {
        "expected_chunk_ids": expected_chunks,
        "retrieved_chunk_ids": retrieved_chunks,
        "expected_sources": sorted(expected_sources),
        "retrieved_sources": sorted(retrieved_sources),
        "chunk_attribution": bool(set(expected_chunks) & set(retrieved_chunks)),
        "all_expected_chunks_returned": set(expected_chunks).issubset(set(retrieved_chunks)),
        "source_attribution": bool(expected_sources & retrieved_sources),
        "unauthorized_sources": unauthorized,
        "unexpected_sources": unexpected_sources,
        "has_unauthorized_or_unexpected_source": bool(unauthorized or unexpected_sources),
        "sources": retrieved,
    }


def contains_any(answer: str, patterns: tuple[str, ...]) -> bool:
    return any(re.search(pattern, answer, flags=re.IGNORECASE) for pattern in patterns)


def evaluate_answer(case_id: str, answer: str, source_result: dict[str, Any], errors: list[str]) -> dict[str, Any]:
    normalized_answer = " ".join(answer.split())
    result: dict[str, Any] = {
        "answer_non_empty": bool(normalized_answer),
        "generation_errors": errors,
        "deterministic_groundedness": {},
    }

    if case_id == "direct_fact":
        expected_fact = contains_any(normalized_answer, (r"\bcredit\s+card\b",))
        contradiction = contains_any(
            normalized_answer,
            (r"not\s+(?:a\s+)?credit\s+card", r"\bdebit\s+card\b", r"\bcash\b", r"\bpaypal\b"),
        )
        result["deterministic_groundedness"] = {
            "expected_fact_credit_card": expected_fact,
            "explicit_contradiction": contradiction,
        }
        result["answer_correctness"] = bool(
            normalized_answer and expected_fact and not contradiction and not errors
        )
    elif case_id == "multi_chunk":
        checks = {
            "lifecycle": contains_any(normalized_answer, (r"\blifecycle\b", r"\bonboarding\b", r"\bstage(?:s)?\b", r"\bprocess\b")),
            "owners_responsibilities": contains_any(normalized_answer, (r"\bowner(?:s)?\b", r"\bresponsibilit(?:y|ies)\b", r"\bapproval\b", r"\bresponsible\b")),
            "escalation": contains_any(normalized_answer, (r"\bescalat(?:e|ion)\b", r"\bciso\b", r"\bhigh[- ]severity\b")),
        }
        result["deterministic_groundedness"] = checks
        result["answer_correctness"] = bool(normalized_answer and all(checks.values()) and not errors)
    else:
        checks = {
            "termination": contains_any(normalized_answer, (r"\bterminat(?:e|ion|ed)\b",)),
            "return_of_materials": contains_any(normalized_answer, (r"return.{0,80}material", r"material.{0,80}return", r"destroy.{0,80}material")),
            "three_year_confidentiality": contains_any(
                normalized_answer,
                (r"\b(?:three\s*\(\s*3\s*\)|three|3)(?:\s+years|\s*-\s*year)(?![A-Za-z0-9-])",),
            ),
        }
        result["deterministic_groundedness"] = checks
        result["answer_correctness"] = bool(normalized_answer and all(checks.values()) and not errors)

    result["answer_correctness"] = bool(result["answer_correctness"] and source_result["all_expected_chunks_returned"])
    return result


def evaluate_case(client: TestClient, api: Any, case: dict[str, Any]) -> dict[str, Any]:
    message = case["question"]
    session_id = str(uuid.uuid4())
    started = time.perf_counter()
    response = None
    try:
        with client.stream(
            "POST",
            "/api/chat",
            headers={"Authorization": f"Bearer {api.issue_access_token(EVALUATION_USER_ID)}"},
            json={
                "message": message,
                "user_id": EVALUATION_USER_ID,
                "session_id": session_id,
                "project_id": EVALUATION_PROJECT_ID,
                "project_files": case.get("project_files"),
            },
        ) as response:
            events = parse_sse(response)
    except Exception as error:
        raise RuntimeError(f"Production endpoint blocked for {case['id']}: {error}") from error

    latency_ms = round((time.perf_counter() - started) * 1000, 2)
    source_events = [event for event in events if event.get("type") == "sources"]
    sources = source_events[-1].get("data", []) if source_events else []
    if not isinstance(sources, list):
        sources = []
    tokens = [event.get("data", "") for event in events if event.get("type") == "token" and isinstance(event.get("data"), str)]
    errors = [str(event.get("data", "")) for event in events if event.get("type") == "error"]
    done_events = [event for event in events if event.get("type") == "done"]
    selections = [event.get("data") for event in events if event.get("type") == "selection"]
    answer = "".join(tokens)
    if answer.lstrip().startswith(RETRIEVAL_FALLBACK_PREFIX):
        raise RuntimeError(
            f"Real LLM provider unavailable for {case['id']}: production returned its "
            "retrieval fallback answer instead of an LLM response"
        )
    source_result = evaluate_sources(case, sources)
    answer_result = evaluate_answer(case["id"], answer, source_result, errors)
    sse_complete = bool(source_events and tokens and done_events and not errors)

    return {
        "case_id": case["id"],
        "session_id": session_id,
        "question": message,
        "answer": answer,
        "cache_status": cache_status(api, message),
        "mode": "mode inferred from emitted events and sources",
        "event_types": [event.get("type") for event in events],
        "selection_events": selections,
        "sse": {
            "http_status": response.status_code,
            "sources_event": bool(source_events),
            "token_events": len(tokens),
            "done_event": bool(done_events),
            "error_events": len(errors),
            "complete": sse_complete,
        },
        "latency_ms": latency_ms,
        **source_result,
        **answer_result,
    }


def markdown_report(results: list[dict[str, Any]]) -> str:
    completed = sum(bool(result["sse"]["complete"]) for result in results)
    answer_checks = sum(bool(result["answer_correctness"]) for result in results)
    chunk_checks = sum(bool(result["all_expected_chunks_returned"]) for result in results)
    source_checks = sum(bool(result["source_attribution"]) for result in results)
    errors = sum(result["sse"]["error_events"] > 0 for result in results)
    mean_latency = round(sum(result["latency_ms"] for result in results) / len(results), 2)

    lines = [
        "# Answer Evaluation Results",
        "",
        "## Overall",
        "",
        f"Cases: {len(results)}",
        f"Successful completions: {completed}/{len(results)}",
        f"Deterministic answer checks passed: {answer_checks}/{len(results)}",
        f"Expected chunk attribution: {chunk_checks}/{len(results)}",
        f"Expected source attribution: {source_checks}/{len(results)}",
        f"SSE protocol complete: {completed}/{len(results)}",
        f"Generation errors: {errors}/{len(results)}",
        "",
    ]
    for result in results:
        lines.extend([
            f"## {result['case_id']}",
            "",
            f"Answer: {json.dumps(result['answer'])}",
            f"Answer correctness: {'PASS' if result['answer_correctness'] else 'FAIL'}",
            f"Expected chunks: {', '.join(result['expected_chunk_ids'])}",
            f"Retrieved chunks: {', '.join(result['retrieved_chunk_ids'])}",
            f"Chunk attribution: {'PASS' if result['all_expected_chunks_returned'] else 'FAIL'}",
            f"Source attribution: {'PASS' if result['source_attribution'] else 'FAIL'}",
            f"Unexpected/unauthorized sources: {'YES' if result['has_unauthorized_or_unexpected_source'] else 'NO'}",
            f"Deterministic groundedness: {json.dumps(result['deterministic_groundedness'], sort_keys=True)}",
            f"SSE: {'PASS' if result['sse']['complete'] else 'FAIL'} ({', '.join(result['event_types'])})",
            f"Cache: {result['cache_status']}",
            f"Latency: {result['latency_ms']} ms",
            "",
        ])
    lines.extend([
        "## Aggregate",
        "",
        f"- Answer completion rate: {completed / len(results):.4f}",
        f"- Deterministic fact accuracy: {answer_checks / len(results):.4f}",
        f"- Expected chunk attribution rate: {chunk_checks / len(results):.4f}",
        f"- Expected source attribution rate: {source_checks / len(results):.4f}",
        f"- SSE completion rate: {completed / len(results):.4f}",
        f"- Generation error rate: {errors / len(results):.4f}",
        f"- Mean latency: {mean_latency} ms",
        "",
        "## Limitations",
        "",
        "- Only the three verified cases were evaluated.",
        "- Deterministic answer checks are not semantic evaluation and no LLM judge was used.",
        "- This reports a deterministic groundedness baseline, not a full faithfulness score.",
        "- Client-facing source content is limited to the first 280 characters, while the prompt may contain more context.",
        "- Mode is inferred from observable events and source presence; the endpoint does not expose an explicit generation mode.",
        "- Cache status is reported as unknown when Redis state cannot be observed.",
        "- Results are baseline measurements, not general RAG quality claims.",
    ])
    return "\n".join(lines)


def main() -> int:
    import api_server as api

    cases = load_verified_cases()
    results = []
    with TestClient(api.app) as client:
        for case in cases:
            result = evaluate_case(client, api, case)
            if result["sse"]["error_events"]:
                raise RuntimeError(
                    f"Real LLM/production generation failed for {case['id']}: "
                    f"{result['generation_errors']}"
                )
            results.append(result)

    print(markdown_report(results))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())