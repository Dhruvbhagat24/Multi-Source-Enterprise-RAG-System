from typing import List

from langchain_community.embeddings import HuggingFaceEmbeddings

from core.ai_interfaces import Embeddings


class HFEmbeddingModel(Embeddings):
    """
    HuggingFace / Sentence-Transformers embedding implementation.
    """

    def __init__(self, model: str):
        """
        model:
            e.g. sentence-transformers/all-MiniLM-L6-v2
        """
        self.model = model
        self.client = HuggingFaceEmbeddings(
            model_name=self.model
        )

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return self.client.embed_documents(texts)

    def embed_query(self, text: str) -> List[float]:
        return self.client.embed_query(text)
