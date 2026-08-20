import uuid
import unittest
import asyncio
from types import SimpleNamespace

from fastapi.testclient import TestClient

import api_server


client = TestClient(api_server.app)
USER_ID = str(uuid.uuid4())
OTHER_USER_ID = str(uuid.uuid4())


def auth_header(user_id: str = USER_ID) -> dict[str, str]:
    return {"Authorization": f"Bearer {api_server.issue_access_token(user_id)}"}


class ApiSecurityTests(unittest.TestCase):
    def test_access_token_is_bound_to_user_id(self):
        response = client.get(
            "/api/documents",
            params={"user_id": OTHER_USER_ID},
            headers=auth_header(USER_ID),
        )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["detail"], "Invalid or expired access token")


    def test_protected_endpoint_requires_authentication(self):
        response = client.get("/api/documents", params={"user_id": USER_ID})

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["detail"], "Authentication required")


    def test_upload_rejects_unsupported_extension_before_storage(self):
        response = client.post(
            "/api/documents/upload",
            data={"user_id": USER_ID},
            files={"file": ("payload.exe", b"not a document", "application/octet-stream")},
            headers=auth_header(),
        )

        self.assertEqual(response.status_code, 415)


    def test_upload_rejects_empty_supported_file_before_storage(self):
        response = client.post(
            "/api/documents/upload",
            data={"user_id": USER_ID},
            files={"file": ("empty.csv", b"", "text/csv")},
            headers=auth_header(),
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "Uploaded file is empty")


    def test_readiness_reports_dependency_state(self):
        response = client.get("/api/ready")

        self.assertIn(response.status_code, {200, 503})
        payload = response.json()
        self.assertIn(payload["status"], {"ready", "not_ready"})
        self.assertEqual(set(payload["checks"]), {
            "postgres",
            "vector_store",
            "llm_config",
            "embeddings_config",
        })

    def test_oauth_provisioning_requires_internal_authentication(self):
        response = client.post("/api/auth/find-or-create", json={"email": "oauth@example.com"})

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["detail"], "Internal authentication required")

    def test_settings_mutation_requires_configured_admin(self):
        response = client.post(
            "/api/settings",
            params={"user_id": USER_ID},
            json={"llm_model": "test-model"},
            headers=auth_header(),
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["detail"], "Administrator access required")


class RetrievalTests(unittest.TestCase):
    ACTIVE_SCOPE = (
        {"doc-a", "doc-b"},
        {"finance.csv", "other.csv"},
        {"finance.csv": {"doc-a"}, "other.csv": {"doc-b"}},
    )

    def test_transaction_id_detector_is_narrow_and_normalized(self):
        self.assertEqual(api_server.detect_transaction_id("payment for TXN-004"), "TXN-004")
        self.assertEqual(api_server.detect_transaction_id("payment for txn-004"), "TXN-004")
        self.assertEqual(api_server.detect_transaction_id("payment for Txn-004"), "TXN-004")
        self.assertIsNone(api_server.detect_transaction_id("payment for ABC-004"))

    def test_exact_lookup_is_user_and_source_scoped(self):
        exact_chunk = SimpleNamespace(
            page_content="Transaction_ID: TXN-004. Payment_Method: Credit Card",
            metadata={
                "chunk_id": "txn-chunk",
                "transaction_id": "TXN-004",
                "user_id": "user-a",
                "source_id": "doc-a",
                "source_file": "finance.csv",
            },
        )

        class ExactVectorStore:
            def similarity_search(self, query, k, filter):
                self.query = query
                self.filter = filter
                if filter["$and"] == [
                    {"user_id": "user-a"},
                    {"source_id": {"$in": ["doc-a"]}},
                    {"transaction_id": "TXN-004"},
                ]:
                    return [exact_chunk]
                return []

        vector_store = ExactVectorStore()
        result = api_server.retrieve_exact_transaction(
            vector_store, "txn-004", 1, "user-a", ["finance.csv"], self.ACTIVE_SCOPE
        )

        self.assertEqual(result, [exact_chunk])
        self.assertEqual(vector_store.query, "TXN-004")
        self.assertEqual(vector_store.filter["$and"][-1], {"transaction_id": "TXN-004"})

        self.assertEqual(
            api_server.retrieve_exact_transaction(
                vector_store, "TXN-004", 1, "other-user", ["finance.csv"], self.ACTIVE_SCOPE
            ),
            [],
        )
        self.assertEqual(
            api_server.retrieve_exact_transaction(
                vector_store, "TXN-004", 1, "user-a", ["other.csv"], self.ACTIVE_SCOPE
            ),
            [],
        )

    def test_exact_match_is_top_one_and_duplicate_is_removed(self):
        exact_chunk = SimpleNamespace(
            page_content="exact row",
            metadata={"chunk_id": "txn-chunk", "user_id": "user-a", "source_id": "doc-a", "source_file": "finance.csv"},
        )
        semantic_duplicate = SimpleNamespace(
            page_content="same row with a different object",
            metadata={"chunk_id": "txn-chunk", "user_id": "user-a", "source_id": "doc-a", "source_file": "finance.csv"},
        )
        semantic_other = SimpleNamespace(
            page_content="semantic supplement",
            metadata={"chunk_id": "other-chunk", "user_id": "user-a", "source_id": "doc-a", "source_file": "finance.csv"},
        )

        class VectorStore:
            def similarity_search(self, query, k, filter):
                return [exact_chunk]

            def as_retriever(self, **kwargs):
                class Retriever:
                    def invoke(self, query):
                        return [semantic_duplicate, semantic_other]
                return Retriever()

        result = asyncio.run(api_server.retrieve_chunks(
            VectorStore(), "What payment method was used for txn-004?", 2, False,
            "user-a", ["finance.csv"], self.ACTIVE_SCOPE,
        ))

        self.assertEqual([chunk.metadata["chunk_id"] for chunk in result], ["txn-chunk", "other-chunk"])

    def test_unknown_transaction_falls_back_to_semantic_retrieval(self):
        semantic_chunk = SimpleNamespace(
            page_content="semantic answer",
            metadata={"chunk_id": "semantic-chunk", "user_id": "user-a", "source_id": "doc-a", "source_file": "finance.csv"},
        )

        class VectorStore:
            def similarity_search(self, query, k, filter):
                return []

            def as_retriever(self, **kwargs):
                class Retriever:
                    def invoke(self, query):
                        return [semantic_chunk]
                return Retriever()

        result = asyncio.run(api_server.retrieve_chunks(
            VectorStore(), "What payment method was used for TXN-999?", 1, False,
            "user-a", ["finance.csv"], self.ACTIVE_SCOPE,
        ))

        self.assertEqual(result, [semantic_chunk])

    def test_non_transaction_query_uses_existing_semantic_path(self):
        semantic_chunk = SimpleNamespace(
            page_content="semantic answer",
            metadata={"chunk_id": "semantic-chunk", "user_id": "user-a", "source_id": "doc-a", "source_file": "finance.csv"},
        )

        class VectorStore:
            def as_retriever(self, **kwargs):
                self.kwargs = kwargs
                class Retriever:
                    def invoke(self, query):
                        return [semantic_chunk]
                return Retriever()

        vector_store = VectorStore()
        result = asyncio.run(api_server.retrieve_chunks(
            vector_store, "Which payment methods are used?", 1, False,
            "user-a", ["finance.csv"], self.ACTIVE_SCOPE,
        ))

        self.assertEqual(result, [semantic_chunk])
        self.assertEqual(vector_store.kwargs["search_type"], "mmr")

    def test_project_filter_is_user_and_source_scoped(self):
        active_scope = (
            {"doc-a", "doc-b"},
            {"policy.pdf", "notes.pdf"},
            {"policy.pdf": {"doc-a"}, "notes.pdf": {"doc-b"}},
        )

        retrieval_filter = api_server.build_retrieval_filter(
            "user-a",
            ["policy.pdf"],
            active_scope,
        )

        self.assertEqual(
            retrieval_filter,
            {
                "$and": [
                    {"user_id": "user-a"},
                    {"source_id": {"$in": ["doc-a"]}},
                ]
            },
        )

    def test_project_retrieval_uses_mmr_and_enforces_top_k(self):
        chunks = [
            SimpleNamespace(page_content="relevant answer", metadata={"source_id": "doc-a", "source_file": "policy.pdf", "user_id": "user-a"}),
            SimpleNamespace(page_content="relevant answer", metadata={"source_id": "doc-a", "source_file": "policy.pdf", "user_id": "user-a"}),
            SimpleNamespace(page_content="another relevant answer", metadata={"source_id": "doc-a", "source_file": "policy.pdf", "user_id": "user-a"}),
            SimpleNamespace(page_content="irrelevant other document", metadata={"source_id": "doc-b", "source_file": "notes.pdf", "user_id": "user-a"}),
        ]
        retriever_calls = []

        class FakeRetriever:
            def invoke(self, query):
                retriever_calls.append(query)
                return chunks

        class FakeVectorStore:
            def as_retriever(self, **kwargs):
                self.kwargs = kwargs
                return FakeRetriever()

        vector_store = FakeVectorStore()
        active_scope = (
            {"doc-a", "doc-b"},
            {"policy.pdf", "notes.pdf"},
            {"policy.pdf": {"doc-a"}, "notes.pdf": {"doc-b"}},
        )

        result = asyncio.run(api_server.retrieve_chunks(
            vector_store=vector_store,
            query="risk controls",
            retrieve_k=2,
            broad_query=False,
            user_id="user-a",
            project_files=["policy.pdf"],
            active_scope=active_scope,
        ))

        self.assertEqual(vector_store.kwargs["search_type"], "mmr")
        self.assertEqual(vector_store.kwargs["search_kwargs"]["k"], 2)
        self.assertEqual(
            vector_store.kwargs["search_kwargs"]["filter"],
            {"$and": [{"user_id": "user-a"}, {"source_id": {"$in": ["doc-a"]}}]},
        )
        self.assertTrue(retriever_calls)
        self.assertIn("risk controls", retriever_calls)
        self.assertLessEqual(len(result), 2)
        self.assertTrue(all(chunk.metadata["source_id"] == "doc-a" for chunk in result))

    def test_unknown_project_file_returns_no_chunks_without_querying(self):
        class FailingVectorStore:
            def as_retriever(self, **kwargs):
                raise AssertionError("unknown project files must not query the vector store")

        active_scope = ({"doc-a"}, {"policy.pdf"}, {"policy.pdf": {"doc-a"}})
        result = asyncio.run(api_server.retrieve_chunks(
            vector_store=FailingVectorStore(),
            query="anything",
            retrieve_k=3,
            broad_query=False,
            user_id="user-a",
            project_files=["missing.pdf"],
            active_scope=active_scope,
        ))

        self.assertEqual(result, [])