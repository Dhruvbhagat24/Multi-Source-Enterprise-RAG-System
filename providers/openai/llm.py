# This file will:

# Import ChatOpenAI

# Implement the LLM interface from core/ai_interfaces.py

# Think of it as a plug.



# These files:

# Know they are OpenAI

# Know model names

# Know env vars

# But they expose only the interface, not OpenAI itself.

import os
from typing import List, Any

from langchain_openai import ChatOpenAI

from core.ai_interfaces import LLM


class OpenAILLM(LLM):
    """
    OpenAI implementation of the LLM interface.
    """

    def __init__(self, model: str, temperature: float = 0):
        """
        model:
            OpenAI model name (e.g. gpt-4o-mini)
        """
        self.model = model
        self.temperature = temperature

        # API key is read implicitly by langchain from env:
        # OPENAI_API_KEY
        self.client = ChatOpenAI(
            model=self.model,
            temperature=self.temperature
        )

    def invoke(self, messages: List[Any]) -> str:
        """
        Invoke OpenAI chat model and return plain text.
        """
        response = self.client.invoke(messages)

        # LangChain returns an AIMessage object
        return response.content
