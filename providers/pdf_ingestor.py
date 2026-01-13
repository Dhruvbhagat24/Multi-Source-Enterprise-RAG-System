from unstructured.partition.pdf import partition_pdf
from core.document_ingestor import DocumentIngestor


class PDFIngestor(DocumentIngestor):
    def can_handle(self, file_path: str) -> bool:
        return file_path.lower().endswith(".pdf")

    def ingest(self, file_path: str):
        print(f"📄 PDFIngestor handling: {file_path}")

        elements = partition_pdf(
            filename=file_path,
            strategy="hi_res",
            infer_table_structure=True,
            extract_image_block_types=["Image"],
            extract_image_block_to_payload=True
        )

        print(f"✅ Extracted {len(elements)} PDF elements")
        return elements
