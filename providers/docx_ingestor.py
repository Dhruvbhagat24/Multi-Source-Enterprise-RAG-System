from unstructured.partition.docx import partition_docx
from core.document_ingestor import DocumentIngestor


class DocxIngestor(DocumentIngestor):
    """
    Ingestor for DOCX files.
    Responsible ONLY for extraction, not chunking or summarization.
    """

    def can_handle(self, file_path: str) -> bool:
        return file_path.lower().endswith(".docx")

    def ingest(self, file_path: str):
        print(f"📄 DocxIngestor handling: {file_path}")

        elements = partition_docx(
            filename=file_path
        )

        print(f"✅ Extracted {len(elements)} DOCX elements")
        return elements
