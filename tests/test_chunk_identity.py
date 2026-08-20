import unittest
from types import SimpleNamespace

from ingestion import build_chunk_identity, rows_to_documents, summarise_chunks


class ChunkIdentityTests(unittest.TestCase):
    def test_same_source_position_and_content_is_stable(self):
        first = build_chunk_identity("source-a", "chunk:1", "same content")
        second = build_chunk_identity("source-a", "chunk:1", "same content")

        self.assertEqual(first, second)

    def test_changed_content_changes_identity(self):
        first = build_chunk_identity("source-a", "chunk:1", "old content")
        second = build_chunk_identity("source-a", "chunk:1", "new content")

        self.assertNotEqual(first[0], second[0])
        self.assertNotEqual(first[1], second[1])

    def test_different_source_changes_identity(self):
        first = build_chunk_identity("source-a", "chunk:1", "same content")
        second = build_chunk_identity("source-b", "chunk:1", "same content")

        self.assertNotEqual(first[0], second[0])
        self.assertEqual(first[1], second[1])

    def test_spreadsheet_rows_receive_deterministic_ids_and_preserve_metadata(self):
        rows = [
            {"_row_index": 4, "Transaction_ID": "TXN-004", "Payment_Method": "Credit Card"},
        ]
        documents = rows_to_documents(
            rows,
            source_id="source-finance",
            source_file="Finance_sheet.xlsx",
            source_type="sheet",
            user_id="user-a",
        )

        document = documents[0]
        self.assertEqual(document.id, document.metadata["chunk_id"])
        self.assertEqual(document.metadata["content_hash"], build_chunk_identity("source-finance", "row:4", document.page_content)[1])
        self.assertEqual(document.metadata["source_file"], "Finance_sheet.xlsx")
        self.assertEqual(document.metadata["source_id"], "source-finance")
        self.assertEqual(document.metadata["user_id"], "user-a")
        self.assertEqual(document.metadata["source_type"], "sheet")
        self.assertEqual(document.metadata["row_index"], 4)
        self.assertEqual(document.metadata["transaction_id"], "TXN-004")
        self.assertEqual(rows[0]["_row_index"], 4)

    def test_transaction_id_metadata_normalization_is_case_insensitive(self):
        document = rows_to_documents(
            [{"_row_index": 1, "Transaction_ID": "txn-004"}],
            source_id="source-finance",
            source_file="Finance_sheet.xlsx",
            source_type="sheet",
            user_id="user-a",
        )[0]

        self.assertEqual(document.metadata["transaction_id"], "TXN-004")

    def test_docx_chunks_receive_deterministic_ids_and_preserve_metadata(self):
        chunks = [
            SimpleNamespace(text="First section", metadata=SimpleNamespace(orig_elements=[])),
            SimpleNamespace(text="Second section", metadata=SimpleNamespace(orig_elements=[])),
        ]
        documents = summarise_chunks(
            chunks,
            source_id="source-docx",
            source_file="SOP_Maintenance.docx",
            source_type="docx",
            user_id="user-a",
        )

        self.assertEqual([document.metadata["chunk_index"] for document in documents], [1, 2])
        self.assertEqual([document.metadata["total_chunks"] for document in documents], [2, 2])
        self.assertEqual([document.id for document in documents], [document.metadata["chunk_id"] for document in documents])
        self.assertEqual(len({document.id for document in documents}), 2)
        for document in documents:
            self.assertEqual(document.metadata["source_file"], "SOP_Maintenance.docx")
            self.assertEqual(document.metadata["source_id"], "source-docx")
            self.assertEqual(document.metadata["user_id"], "user-a")
            self.assertEqual(document.metadata["source_type"], "docx")
            self.assertEqual(len(document.metadata["content_hash"]), 64)


if __name__ == "__main__":
    unittest.main()
