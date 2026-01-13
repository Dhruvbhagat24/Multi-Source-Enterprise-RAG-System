# This file owns everything related to DB lifecycle.
import os
from typing import List

from langchain_chroma import Chroma
from langchain_core.documents import Document

from core.ai_factory import get_embeddings


class VectorStoreManager:
    """
    Manages the lifecycle of the vector store (ChromaDB).

    Responsibilities:
    - Create or load an existing vector store
    - Add documents incrementally
    - Persist the store
    """

    def __init__(self, persist_directory: str = "chroma_db"):
        self.persist_directory = persist_directory
        self.embedding_model = get_embeddings("default")

        self._db = None

    def load_or_create(self) -> Chroma:
        """
        Load an existing vector store if it exists,
        otherwise create a new one.
        """
        if self._db is not None:
            return self._db

        if os.path.exists(self.persist_directory):
            print(f"📦 Loading existing vector store from {self.persist_directory}")
            self._db = Chroma(
                persist_directory=self.persist_directory,
                embedding_function=self.embedding_model
            )
        else:
            print(f"🆕 Creating new vector store at {self.persist_directory}")
            self._db = Chroma(
                persist_directory=self.persist_directory,
                embedding_function=self.embedding_model
            )

        return self._db

    def add_documents(self, documents: List[Document]):
        """
        Add documents to the vector store incrementally.
        """
        if not documents:
            return

        db = self.load_or_create()
        db.add_documents(documents)

    def persist(self):
        """
        Chroma auto-persists when persist_directory is set.
        This method exists for API symmetry and future extensibility.
        """
        print("💾 Vector store auto-persisted (no-op for Chroma)")
        # 👉 We keep the method for:

        # future DBs (FAISS, Pinecone, Qdrant)

        # clean lifecycle symmetry


    def as_retriever(self, **kwargs):
        """
        Return a retriever interface for querying.
        """
        db = self.load_or_create()
        return db.as_retriever(**kwargs)

