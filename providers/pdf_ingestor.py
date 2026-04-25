import os

from unstructured.partition.pdf import partition_pdf
from core.document_ingestor import DocumentIngestor


class PDFIngestor(DocumentIngestor):
    def can_handle(self, file_path: str) -> bool:
        return file_path.lower().endswith(".pdf")

    def ingest(self, file_path: str):
        print(f"📄 PDFIngestor handling: {file_path}")

        # Try a lightweight strategy first, then fall back to OCR-friendly modes
        # if the PDF yields no extractable elements.
        strategy = os.getenv("PDF_PARTITION_STRATEGY", "fast")
        infer_tables = os.getenv("PDF_INFER_TABLES", "false").lower() == "true"
        extract_images = os.getenv("PDF_EXTRACT_IMAGES", "false").lower() == "true"
        languages_raw = os.getenv("PDF_LANGUAGES", "eng")
        languages = [lang.strip() for lang in languages_raw.split(",") if lang.strip()]

        fallback_strategies = [strategy, "hi_res", "ocr_only"]
        tried = []
        elements = []

        for candidate_strategy in fallback_strategies:
            if candidate_strategy in tried:
                continue
            tried.append(candidate_strategy)

            try:
                elements = partition_pdf(
                    filename=file_path,
                    strategy=candidate_strategy,
                    languages=languages,
                    infer_table_structure=infer_tables,
                    extract_image_block_types=["Image"] if extract_images else None,
                    extract_image_block_to_payload=extract_images,
                )
            except Exception as exc:
                print(f"⚠️ PDF partition with strategy '{candidate_strategy}' failed: {exc}")
                continue

            if elements:
                if candidate_strategy != strategy:
                    print(f"✅ PDF fallback succeeded with strategy '{candidate_strategy}'")
                break

        print(f"✅ Extracted {len(elements)} PDF elements")
        return elements
