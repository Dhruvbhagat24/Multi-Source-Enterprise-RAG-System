from typing import List, Any, Iterator
import os

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

        # Performance-oriented defaults for local inference.
        num_ctx = int(os.getenv("OLLAMA_NUM_CTX", "2048"))
        num_predict = int(os.getenv("OLLAMA_NUM_PREDICT", "256"))
        keep_alive = os.getenv("OLLAMA_KEEP_ALIVE", "10m")
        base_url = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")

        self.client = ChatOllama(
            model=self.model,
            temperature=self.temperature,
            base_url=base_url,
            num_ctx=num_ctx,
            num_predict=num_predict,
            keep_alive=keep_alive,
        )

    def invoke(self, messages: List[Any]) -> str:
        response = self.client.invoke(messages)
        return response.content

    def stream(self, messages: List[Any]) -> Iterator[str]:
        for chunk in self.client.stream(messages):
            content = getattr(chunk, "content", "")
            if content:
                yield content
