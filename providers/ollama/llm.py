from typing import List, Any, Iterator
import os

from langchain_ollama import ChatOllama  # new

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
        num_ctx = int(os.getenv("OLLAMA_NUM_CTX", "1536"))
        num_predict = int(os.getenv("OLLAMA_NUM_PREDICT", "150"))
        keep_alive = os.getenv("OLLAMA_KEEP_ALIVE", "30m")
        base_url = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
        num_thread = int(os.getenv("OLLAMA_NUM_THREAD", "0"))  # 0 = auto-detect
        num_gpu = int(os.getenv("OLLAMA_NUM_GPU", "-1"))  # -1 = all layers on GPU

        kwargs = dict(
            model=self.model,
            temperature=self.temperature,
            base_url=base_url,
            num_ctx=num_ctx,
            num_predict=num_predict,
            keep_alive=keep_alive,
            repeat_penalty=1.1,
        )
        if num_thread > 0:
            kwargs["num_thread"] = num_thread
        if num_gpu >= 0:
            kwargs["num_gpu"] = num_gpu

        self.client = ChatOllama(**kwargs)

    def invoke(self, messages: List[Any]) -> str:
        response = self.client.invoke(messages)
        return response.content

    def stream(self, messages: List[Any]) -> Iterator[str]:
        for chunk in self.client.stream(messages):
            content = getattr(chunk, "content", "")
            if content:
                yield content
