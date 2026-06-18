# Minimal RAG pipeline

A complete Retrieval-Augmented Generation pipeline in one readable file,
hand-rolled (no LangChain / FAISS) so every stage is visible.

## Run
```bash
pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-...   # optional; without it you see the retrieved context
python minimal_rag.py
```
The first run downloads a ~90 MB embedding model (all-MiniLM-L6-v2) once.

## The pattern
**Indexing (once):** documents -> chunk -> embed -> store
**Query (per question):** question -> embed -> retrieve top-k -> augment prompt -> generate

## Where to grow it
| Stage | Here (learning) | Production swap |
|------|------|------|
| Chunking | char windows + overlap | token-aware splitter |
| Embedding | local MiniLM (384d) | larger / API embeddings |
| Vector store | numpy cosine, brute force | FAISS · Chroma · pgvector |
| Retrieval | top-k cosine | + reranker, hybrid BM25, metadata filters |
| Generation | Claude, context-only prompt | + streaming, citations, eval harness |
