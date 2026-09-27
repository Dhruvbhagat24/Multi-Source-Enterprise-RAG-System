import os

from dotenv import load_dotenv


load_dotenv()


def _setting(prefix: str, name: str, default: str) -> str:
	return os.getenv(f"{prefix}_{name.upper()}", default).strip()


def get_llm(name: str = "primary"):
	provider = _setting("LLM", f"{name}_PROVIDER", "ollama").lower()
	model = _setting("LLM", f"{name}_MODEL", "mistral")

	if provider == "groq":
		from providers.groq.llm import GroqLLM

		return GroqLLM(model=model)
	if provider == "openai":
		from providers.openai.llm import OpenAILLM

		return OpenAILLM(model=model)
	if provider == "ollama":
		from providers.ollama.llm import OllamaLLM

		return OllamaLLM(model=model)

	raise ValueError(f"Unsupported LLM provider: {provider}")


def get_embeddings(name: str = "default"):
	provider = _setting("EMBEDDINGS", f"{name}_PROVIDER", "hf").lower()
	model = _setting("EMBEDDINGS", f"{name}_MODEL", "all-MiniLM-L6-v2")

	if provider in {"hf", "huggingface"}:
		from providers.huggingface.embeddings import HFEmbeddingModel

		return HFEmbeddingModel(model=model)

	raise ValueError(f"Unsupported embeddings provider: {provider}")
