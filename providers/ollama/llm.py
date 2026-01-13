from typing import List, Any

from langchain_community.chat_models import ChatOllama

from core.ai_interfaces import LLM


class OllamaLLM(LLM):
    """
    Ollama-based local LLM implementation.
    """

    def __init__(self, model: str, temperature: float = 0):
        """
        model:
            Ollama model name (e.g. llama3:8b-instruct-q4_K_M)
        """
        self.model = model
        self.temperature = temperature

        self.client = ChatOllama(
            model=self.model,
            temperature=self.temperature
        )

    def invoke(self, messages: List[Any]) -> str:
        response = self.client.invoke(messages)
        return response.content
