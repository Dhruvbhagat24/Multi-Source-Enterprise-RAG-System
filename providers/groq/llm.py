import os
from typing import List, Any, Iterator

from langchain_groq import ChatGroq

from core.ai_interfaces import LLM


class GroqLLM(LLM):
    """
    Groq cloud LLM implementation.
    Ultra-fast inference via Groq's LPU hardware.
    """

    def __init__(self, model: str, temperature: float = 0):
        """
        model:
            Groq model name (e.g. llama-3.3-70b-versatile, mixtral-8x7b-32768)
        """
        self.model = model
        self.temperature = temperature

        # API key is read from env: GROQ_API_KEY
        self.client = ChatGroq(
            model=self.model,
            temperature=self.temperature,
            api_key=os.getenv("GROQ_API_KEY"),
        )

    def invoke(self, messages: List[Any]) -> str:
        """
        Invoke Groq chat model and return plain text.
        """
        response = self.client.invoke(messages)
        return response.content

    def stream(self, messages: List[Any]) -> Iterator[str]:
        for chunk in self.client.stream(messages):
            content = getattr(chunk, "content", "")
            if content:
                yield content
