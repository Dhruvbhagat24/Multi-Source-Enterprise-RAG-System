import os

from core.ai_interfaces import LLM, Embeddings

# OpenAI implementations
from providers.openai.llm import OpenAILLM
from providers.openai.embeddings import OpenAIEmbeddingModel

#local models
from providers.ollama.llm import OllamaLLM
from providers.huggingface.embeddings import HFEmbeddingModel

# Cloud inference
from providers.groq.llm import GroqLLM


def get_llm(role: str) -> LLM:
    """
    Return an LLM instance based on role configuration.

    Example roles:
        - primary
        - summarizer
        - fallback
    """
    role = role.upper()

    provider = os.getenv(f"LLM_{role}_PROVIDER")
    model = os.getenv(f"LLM_{role}_MODEL")

    if not provider or not model:
        raise ValueError(
            f"LLM configuration missing for role '{role}'"
        )

    provider = provider.lower()

    if provider == "openai":
        return OpenAILLM(model=model)
    
    if provider == "ollama":
        return OllamaLLM(model=model)

    if provider == "groq":
        return GroqLLM(model=model)

    raise ValueError(f"Unsupported LLM provider: {provider}")


def get_embeddings(role: str) -> Embeddings:
    """
    Return an Embeddings instance based on role configuration.

    Example roles:
        - default
        - cheap
    """
    role = role.upper()

    provider = os.getenv(f"EMBEDDINGS_{role}_PROVIDER")
    model = os.getenv(f"EMBEDDINGS_{role}_MODEL")

    if not provider or not model:
        raise ValueError(
            f"Embeddings configuration missing for role '{role}'"
        )

    provider = provider.lower()

    if provider == "openai":
        return OpenAIEmbeddingModel(model=model)
    
    if provider == "hf":
        return HFEmbeddingModel(model=model)

    raise ValueError(f"Unsupported Embeddings provider: {provider}")






# Responsibility of ai_factory.py

# Read environment variables

# Decide which provider to use

# Return an object that matches the interface

# Conceptually:
# get_llm("primary")      -> returns LLM interface
# get_embeddings("default") -> returns Embeddings interface

# 🚨 Key rule
# Your pipeline will talk ONLY to this factory.

# Never again:

# ChatOpenAI(...)
# OpenAIEmbeddings(...)




# Deep code analysis

# Let’s break this down slowly (this is important)
# 1️⃣ Why roles are uppercased
# role = role.upper()


# So this works safely:

# get_llm("primary")
# get_llm("Primary")
# get_llm("PRIMARY")


# And maps to:

# LLM_PRIMARY_PROVIDER

# 2️⃣ Why environment variables, not arguments?

# Because:

# deployment config ≠ code

# dev/test/prod differences belong in environment

# Kubernetes, Docker, CI/CD all rely on env vars

# This is 12-factor app design (industry standard).

# 3️⃣ Why if provider == "openai"?

# Because this is where provider expansion happens later:

# if provider == "openai":
#     ...
# elif provider == "ollama":
#     ...
# elif provider == "hf":
#     ...


# This file is the single switchboard.

# 4️⃣ Why return interface types?
# def get_llm(...) -> LLM:


# This guarantees:

# callers only rely on the interface

# no provider-specific behavior leaks

# Even though we return OpenAILLM,
# the caller treats it as LLM.

# What happens end-to-end (mentally simulate)
# llm = get_llm("primary")


# Reads LLM_PRIMARY_PROVIDER

# Reads LLM_PRIMARY_MODEL

# Chooses OpenAILLM

# Returns object with .invoke()

# Pipeline doesn’t care how.

