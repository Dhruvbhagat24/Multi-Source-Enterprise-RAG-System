from typing import List

from langchain_openai import OpenAIEmbeddings

from core.ai_interfaces import Embeddings


class OpenAIEmbeddingModel(Embeddings):
    """
    OpenAI implementation of the Embeddings interface.
    """

    def __init__(self, model: str):
        """
        model:
            OpenAI embedding model name
            (e.g. text-embedding-3-small)
        """
        self.model = model
        self.client = OpenAIEmbeddings(model=self.model)

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """
        Embed multiple documents.
        """
        return self.client.embed_documents(texts)

    def embed_query(self, text: str) -> List[float]:
        """
        Embed a single query string.
        """
        return self.client.embed_query(text)
