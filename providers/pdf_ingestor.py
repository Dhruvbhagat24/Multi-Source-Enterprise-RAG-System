import os

from unstructured.partition.pdf import partition_pdf
from core.document_ingestor import DocumentIngestor


class PDFIngestor(DocumentIngestor):
    def can_handle(self, file_path: str) -> bool:
        return file_path.lower().endswith(".pdf")

    def ingest(self, file_path: str):
        print(f"📄 PDFIngestor handling: {file_path}")

        # Use a safer default strategy for local/dev environments.
        strategy = os.getenv("PDF_PARTITION_STRATEGY", "fast")
        infer_tables = os.getenv("PDF_INFER_TABLES", "false").lower() == "true"
        extract_images = os.getenv("PDF_EXTRACT_IMAGES", "false").lower() == "true"

        elements = partition_pdf(
            filename=file_path,
            strategy=strategy,
            infer_table_structure=infer_tables,
            extract_image_block_types=["Image"] if extract_images else None,
            extract_image_block_to_payload=extract_images,
        )

        print(f"✅ Extracted {len(elements)} PDF elements")
        return elements
