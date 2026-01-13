# This is the contract for all file types.
from abc import ABC, abstractmethod
from typing import Any


class DocumentIngestor(ABC):
    """
    Abstract interface for document ingestion.
    Responsible only for extracting raw elements.
    """

    @abstractmethod
    def can_handle(self, file_path: str) -> bool:
        """
        Whether this ingestor can handle the given file.
        """
        pass

    @abstractmethod
    def ingest(self, file_path: str) -> list[Any]:
        """
        Extract raw elements from the file.
        """
        pass
