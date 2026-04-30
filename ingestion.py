import json
import os
from typing import List

# Unstructured for document parsing
from unstructured.partition.pdf import partition_pdf
from unstructured.chunking.title import chunk_by_title

# LangChain components
from langchain_core.documents import Document
from core.ai_factory import get_llm, get_embeddings
from core.vector_store import VectorStoreManager
import uuid
from core.file_router import FileRouter
from providers.pdf_ingestor import PDFIngestor
from providers.docx_ingestor import DocxIngestor
from providers.sheet_ingestor import SheetIngestor




from langchain_chroma import Chroma
from langchain_core.messages import HumanMessage
from dotenv import load_dotenv

load_dotenv()

import pandas as pd
import numpy as np


def normalize_for_json(value):
    """
    Convert pandas / numpy types to JSON-serializable Python primitives.
    """
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        return float(value)
    if pd.isna(value):
        return None
    return value



#________________________________________________________________________________________________________________
def rows_to_documents(
    rows: list[dict],
    source_id: str,
    source_file: str,
    source_type: str,
    user_id: str = None
):
    documents = []

    for row in rows:
        row_index = row.pop("_row_index", None)

        # Normalize row values
        normalized_row = {
            key: normalize_for_json(value)
            for key, value in row.items()
        }

        # Convert row into natural language
        content_parts = []
        for key, value in normalized_row.items():
            content_parts.append(f"{key}: {value}")

        text = ". ".join(content_parts)

        doc = Document(
            page_content=text,
            metadata={
                "source_id": source_id,
                "source_file": source_file,
                "source_type": source_type,
                "user_id": user_id,
                "row_index": row_index,
                "columns": ",".join(normalized_row.keys()),
                "original_row": json.dumps(normalized_row)
            }
        )
        documents.append(doc)

    return documents

#________________________________________________________________________________________________________________


file_router = FileRouter(
    ingestors=[
        PDFIngestor(),
        DocxIngestor(),
        SheetIngestor()
    ]
)

#________________________________________________________________________________________________________________

# def partition_document(file_path: str):
#     """Extract elements from PDF using unstructured"""
#     print(f"📄 Partitioning document: {file_path}")
    
#     elements = partition_pdf(
#         filename=file_path,  # Path to your PDF file
#         strategy="hi_res", # Use the most accurate (but slower) processing method of extraction
#         infer_table_structure=True, # Keep tables as structured HTML, not jumbled text
#         extract_image_block_types=["Image"], # Grab images found in the PDF
#         extract_image_block_to_payload=True # Store images as base64 data you can actually use
#     )
    
#     print(f"✅ Extracted {len(elements)} elements")
#     return elements

# Test with your PDF file
# file_path = "./docs/attention-is-all-you-need.pdf"  # Change this to your PDF path
# elements = partition_document(file_path)

# All types of different atomic elements we see from unstructured
# set([str(type(el)) for el in elements])
# View the contents inside an element
# elements[13].to_dict()
#________________________________________________________________________________________________________________


def create_chunks_by_title(elements):
    """Create intelligent chunks using title-based strategy"""
    print("🔨 Creating smart chunks...")
    
    chunks = chunk_by_title(
        elements, # The parsed PDF elements from previous step
        max_characters=3000, # Hard limit - never exceed 3000 characters per chunk
        new_after_n_chars=2400, # Try to start a new chunk after 2400 characters
        combine_text_under_n_chars=500 # Merge tiny chunks under 500 chars with neighbors
    )
    
    print(f"✅ Created {len(chunks)} chunks")
    return chunks

# Create chunks
# chunks = create_chunks_by_title(elements)
#View all chunks
# chunks

# All unique types
# set([str(type(chunk)) for chunk in chunks])
# View a single chunk
#chunks[14].to_dict()

# View original elements
# chunks[14].metadata.orig_elements[5].to_dict()
# Note: 4th chunk has the first image + 11th chunk has the first table in the sample PDF
#________________________________________________________________________________________________________________
def separate_content_types(chunk):
    """Analyze what types of content are in a chunk"""
    content_data = {
        'text': chunk.text,
        'tables': [],
        'images': [],
        'types': ['text']
    }
    
    # Check for tables and images in original elements
    if hasattr(chunk, 'metadata') and hasattr(chunk.metadata, 'orig_elements'):
        for element in chunk.metadata.orig_elements:
            element_type = type(element).__name__
            
            # Handle tables
            if element_type == 'Table':
                content_data['types'].append('table')
                table_html = getattr(element.metadata, 'text_as_html', element.text)
                content_data['tables'].append(table_html)
            
            # Handle images
            elif element_type == 'Image':
                if hasattr(element, 'metadata') and hasattr(element.metadata, 'image_base64'):
                    content_data['types'].append('image')
                    content_data['images'].append(element.metadata.image_base64)
    
    content_data['types'] = list(set(content_data['types']))
    return content_data

def create_ai_enhanced_summary(text: str, tables: List[str], images: List[str]) -> str:
    """Create AI-enhanced summary for mixed content"""
    
    try:
        # Initialize LLM (needs vision model for images)
        # llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
        llm = get_llm("primary")

        
        # Build the text prompt
        prompt_text = f"""You are creating a searchable description for document content retrieval.

        CONTENT TO ANALYZE:
        TEXT CONTENT:
        {text}

        """
        
        # Add tables if present
        if tables:
            prompt_text += "TABLES:\n"
            for i, table in enumerate(tables):
                prompt_text += f"Table {i+1}:\n{table}\n\n"
        
            prompt_text += """
            YOUR TASK:
            Generate a comprehensive, searchable description that covers:

            1. Key facts, numbers, and data points from text and tables
            2. Main topics and concepts discussed  
            3. Questions this content could answer
            4. Visual content analysis (charts, diagrams, patterns in images)
            5. Alternative search terms users might use

            Make it detailed and searchable - prioritize findability over brevity.

            SEARCHABLE DESCRIPTION:"""

        # Build message content starting with text
        message_content = [{"type": "text", "text": prompt_text}]
        
        # Add images to the message
        for image_base64 in images:
            message_content.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}
            })
        
        # Send to AI and get response
        message = HumanMessage(content=message_content)
        # response = llm.invoke([message])
        
        # return response.content
        response = llm.invoke([message])
        return response.content if hasattr(response, 'content') else response

        
    except Exception as e:
        print(f"     ❌ AI summary failed: {e}")
        # Fallback to simple summary
        summary = f"{text[:300]}..."
        if tables:
            summary += f" [Contains {len(tables)} table(s)]"
        if images:
            summary += f" [Contains {len(images)} image(s)]"
        return summary

def summarise_chunks(
            chunks,
            source_id: str,
            source_file: str,
            source_type: str,
            user_id: str = None
        ):
    """Process all chunks with AI Summaries"""
    print("🧠 Processing chunks with AI Summaries...")
    
    langchain_documents = []
    total_chunks = len(chunks)
    
    for i, chunk in enumerate(chunks):
        current_chunk = i + 1
        print(f"   Processing chunk {current_chunk}/{total_chunks}")
        
        # Analyze chunk content
        content_data = separate_content_types(chunk)
        
        # Debug prints
        print(f"     Types found: {content_data['types']}")
        print(f"     Tables: {len(content_data['tables'])}, Images: {len(content_data['images'])}")
        
        # Create AI-enhanced summary if chunk has tables/images
        if content_data['tables'] or content_data['images']:
            print(f"     → Creating AI summary for mixed content...")
            try:
                enhanced_content = create_ai_enhanced_summary(
                    content_data['text'],
                    content_data['tables'], 
                    content_data['images']
                )
                print(f"     → AI summary created successfully")
                print(f"     → Enhanced content preview: {enhanced_content[:200]}...")
            except Exception as e:
                print(f"     ❌ AI summary failed: {e}")
                enhanced_content = content_data['text']
        else:
            print(f"     → Using raw text (no tables/images)")
            enhanced_content = content_data['text']
        
        # Create LangChain Document with rich metadata
        doc = Document(
            page_content=enhanced_content,
            metadata={
                "source_id": source_id,
                "source_file": source_file,
                "source_type": source_type,
                "user_id": user_id,
                "chunk_index": i + 1,
                "total_chunks": total_chunks,
                "original_content": json.dumps({
                    "raw_text": content_data['text'],
                    "tables_html": content_data['tables'],
                    "images_base64": content_data['images']
                })
            }
        )

        
        langchain_documents.append(doc)
    
    print(f"✅ Processed {len(langchain_documents)} chunks")
    return langchain_documents


# # Process chunks with AI
# processed_chunks = summarise_chunks(chunks)

#________________________________________________________________________________________________________________


def export_chunks_to_json(chunks, filename="chunks_export.json"):
    """Export processed chunks to clean JSON format"""
    export_data = []
    
    for i, doc in enumerate(chunks):
        chunk_data = {
            "chunk_id": i + 1,
            "enhanced_content": doc.page_content,
            "metadata": {
                "original_content": json.loads(doc.metadata.get("original_content", "{}"))
            }
        }
        export_data.append(chunk_data)
    
    # Save to file
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(export_data, f, indent=2, ensure_ascii=False)
    
    print(f"✅ Exported {len(export_data)} chunks to {filename}")
    return export_data

# Export your chunks
# json_data = export_chunks_to_json(processed_chunks)
#________________________________________________________________________________________________________________

# def create_vector_store(documents, persist_directory="dbv1/chroma_db"):
#     """Create and persist ChromaDB vector store"""
#     print("🔮 Creating embeddings and storing in ChromaDB...")
        
#     # embedding_model = OpenAIEmbeddings(model="text-embedding-3-small")
#     embedding_model = get_embeddings("default")

    
#     # Create ChromaDB vector store
#     print("--- Creating vector store ---")
#     vectorstore = Chroma.from_documents(
#         documents=documents,
#         embedding=embedding_model,
#         persist_directory=persist_directory, 
#         collection_metadata={"hnsw:space": "cosine"}
#     )
#     print("--- Finished creating vector store ---")
    
#     print(f"✅ Vector store created and saved to {persist_directory}")
#     return vectorstore

# # Create the vector store
# # db = create_vector_store(processed_chunks)

#________________________________________________________________________________________________________________

# After your retrieval
# query = "What are the two main components of the Transformer architecture? "
# retriever = db.as_retriever(search_kwargs={"k": 3})
# chunks = retriever.invoke(query)

# # Export to JSON
# export_chunks_to_json(chunks, "rag_results.json")

#________________________________________________________________________________________________________________

# def run_complete_ingestion_pipeline(pdf_path: str):
#     """Run the complete RAG ingestion pipeline"""
#     print("🚀 Starting RAG Ingestion Pipeline")
#     print("=" * 50)
    
#     # Step 1: Partition
#     elements = partition_document(pdf_path)
    
#     # Step 2: Chunk
#     chunks = create_chunks_by_title(elements)
    
#     # Step 3: AI Summarisation
#     summarised_chunks = summarise_chunks(chunks)
    
#     # Step 4: Vector Store
#     db = create_vector_store(summarised_chunks, persist_directory="dbv2/chroma_db")
    
#     print("🎉 Pipeline completed successfully!")
#     return db

# Run the complete pipeline



#________________________________________________________________________________________________________________

# Folder-based multi-PDF ingestion (new function)

def ingest_folder(folder_path: str, vector_store: VectorStoreManager, file_router: FileRouter):
    print(f"📂 Ingesting folder: {folder_path}")

    for filename in os.listdir(folder_path):
        file_path = os.path.join(folder_path, filename)

        # Skip directories
        if not os.path.isfile(file_path):
            continue

        try:
            print(f"\n📄 Ingesting file: {filename}")
            run_complete_ingestion_pipeline(
                file_path,
                vector_store,
                file_router
            )
        except ValueError as e:
            # No ingestor found for this file type
            print(f"⚠️ Skipping file {filename}: {e}")

    vector_store.persist()
    print("✅ Folder ingestion completed")


#________________________________________________________________________________________________________________
def run_complete_ingestion_pipeline(
    file_path: str,
    vector_store: VectorStoreManager,
    file_router: FileRouter,
    original_filename: str = None,
    source_id: str = None,
    user_id: str = None,
):
    print("🚀 Starting RAG Ingestion Pipeline")
    print("=" * 50)

    source_id = source_id or str(uuid.uuid4())
    source_file = original_filename or os.path.basename(file_path)

    ingestor = file_router.route(file_path)
    source_type = ingestor.__class__.__name__.replace("Ingestor", "").lower()

    extracted = ingestor.ingest(file_path)
    if not extracted:
        raise ValueError(
            f"No extractable content found in '{source_file}'. "
            "The file may be empty, image-only, or unsupported by the current parser settings."
        )

    if source_type == "sheet":
        documents = rows_to_documents(
            extracted,
            source_id=source_id,
            source_file=source_file,
            source_type=source_type,
            user_id=user_id
        )
    else:
        chunks = create_chunks_by_title(extracted)
        if not chunks:
            raise ValueError(
                f"No chunks could be created from '{source_file}'. "
                "Try a cleaner source file or adjust parser/chunking settings."
            )
        documents = summarise_chunks(
            chunks,
            source_id=source_id,
            source_file=source_file,
            source_type=source_type,
            user_id=user_id
        )

    if not documents:
        raise ValueError(
            f"No documents were generated from '{source_file}'. "
            "Ingestion aborted to prevent indexing empty content."
        )

    vector_store.add_documents(documents)
    print(f"🎉 Document ingestion completed: {source_file}")

#________________________________________________________________________________________________________________

# db = run_complete_ingestion_pipeline("./docs/attention-is-all-you-need.pdf")

# vector_store = VectorStoreManager(persist_directory="dbv2/chroma_db")

# run_complete_ingestion_pipeline(
#     "./docs/attention-is-all-you-need.pdf",
#     vector_store
# )

# vector_store.persist()





def generate_final_answer(chunks, query):
    """Generate final answer using multimodal content"""
    
    try:
        # Initialize LLM (needs vision model for images)
        # llm = ChatOpenAI(model="gpt-4o", temperature=0)
        llm = get_llm("primary")

        
        # Build the text prompt
        prompt_text = f"""Based on the following documents, please answer this question: {query}

        CONTENT TO ANALYZE:
        """
        
        for i, chunk in enumerate(chunks):
            prompt_text += f"--- Document {i+1} ---\n"

            # ALWAYS include page_content
            prompt_text += f"CONTENT:\n{chunk.page_content}\n\n"

            # OPTIONAL: include structured metadata if present
            if "original_content" in chunk.metadata:
                original_data = json.loads(chunk.metadata["original_content"])

                raw_text = original_data.get("raw_text")
                if raw_text:
                    prompt_text += f"RAW TEXT:\n{raw_text}\n\n"

                tables_html = original_data.get("tables_html", [])
                if tables_html:
                    prompt_text += "TABLES:\n"
                    for table in tables_html:
                        prompt_text += f"{table}\n\n"

        
        prompt_text += """
        Please provide a clear, comprehensive answer using the text, tables, and images above. If the documents don't contain sufficient information to answer the question, say "I don't have enough information to answer that question based on the provided documents."

        ANSWER:"""

        # Build message content starting with text
        message_content = [{"type": "text", "text": prompt_text}]
        
        # Add all images from all chunks
        for chunk in chunks:
            if "original_content" in chunk.metadata:
                original_data = json.loads(chunk.metadata["original_content"])
                images_base64 = original_data.get("images_base64", [])
                
                for image_base64 in images_base64:
                    message_content.append({
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}
                    })
        
        # Send to AI and get response
        message = HumanMessage(content=message_content)
        # response = llm.invoke([message])
        
        # return response.content
        response_text = llm.invoke([message])
        return response_text

        
    except Exception as e:
        print(f"❌ Answer generation failed: {e}")
        return "Sorry, I encountered an error while generating the answer."

if __name__ == "__main__":
    # Manual/local test harness only. This must not run when imported by api_server.
    vector_store = VectorStoreManager(persist_directory="dbv2/chroma_db")

    ingest_folder(
        "./docs",
        vector_store,
        file_router
    )

    query = "What is the payment method used for TXN-004?"
    retriever = vector_store.as_retriever(search_kwargs={"k": 3})
    chunks = retriever.invoke(query)

    final_answer = generate_final_answer(chunks, query)
    print(final_answer)