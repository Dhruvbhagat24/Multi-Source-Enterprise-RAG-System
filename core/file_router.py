from typing import List
from core.document_ingestor import DocumentIngestor


class FileRouter:
    def __init__(self, ingestors: List[DocumentIngestor]):
        self.ingestors = ingestors

    def route(self, file_path: str) -> DocumentIngestor:
        for ingestor in self.ingestors:
            if ingestor.can_handle(file_path):
                return ingestor

        raise ValueError(f"No ingestor found for file: {file_path}")
