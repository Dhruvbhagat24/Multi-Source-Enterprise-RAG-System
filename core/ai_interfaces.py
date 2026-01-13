from abc import ABC, abstractmethod
from typing import List, Any


class LLM(ABC):
    """
    Abstract interface for all LLM providers.
    
    Your pipeline will ONLY depend on this interface.
    """

    @abstractmethod
    def invoke(self, messages: List[Any]) -> str:
        """
        Execute the LLM on a list of messages and return text output.

        messages:
            Provider-agnostic message format (LangChain messages for now)

        returns:
            Generated text response
        """
        pass


class Embeddings(ABC):
    """
    Abstract interface for all embedding providers.
    """

    @abstractmethod
    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """
        Convert a list of documents into embedding vectors.
        """
        pass

    @abstractmethod
    def embed_query(self, text: str) -> List[float]:
        """
        Convert a single query string into an embedding vector.
        """
        pass

#________________________________________________________________________________________________________________

# # Explanation:
# What is ./core/ai_interfaces.py actually?

# This file is a contract, not an implementation.

# Think of it like:

# “Any LLM I ever use in this project MUST behave like this.”

# It does NOT:

# call OpenAI

# call Claude

# know APIs

# know model names

# It only defines rules.

# Why do we need this?

# Because later you want this to work:

# llm = get_llm("primary")
# response = llm.invoke(messages)


# And you don’t care whether:

# llm is OpenAI

# or Claude

# or Gemini

# or Ollama

# As long as .invoke() works.

# How Python enforces this: Abstract Base Classes (ABC)

# Python gives us a tool for this exact purpose:
# abc → Abstract Base Classes

# They allow you to say:

# “If you inherit from this class, you MUST implement these methods.”












# What this file represents (conceptually)
# This file answers the question:
# “What does an LLM need to be able to do for my system?”




# What you should write 

# One abstract interface for LLMs

# One abstract interface for Embeddings

# Conceptually

# LLM:
# - invoke(messages) -> str

# Embeddings:
# - embed_documents(texts: List[str]) -> List[List[float]]
# - embed_query(text: str) -> List[float]

