"""
minimal_rag.py — A complete, readable RAG pipeline in one file.

RAG = Retrieval-Augmented Generation. Instead of asking an LLM to answer from
its frozen memory, we (1) RETRIEVE the most relevant chunks of YOUR documents
and (2) put them in the prompt so the model answers from grounded context.
This is what makes answers current, source-able, and far less prone to
hallucination.

The pipeline has two phases:

    INDEXING  (run once, offline):  documents -> chunk -> embed -> store
    QUERY     (every question):     question  -> embed -> retrieve -> augment -> generate

Everything below is intentionally hand-rolled (no LangChain, no FAISS) so the
mechanics are fully visible. The one-line production swap for each stage is
noted in its comment.

Run:
    pip install -r requirements.txt
    export ANTHROPIC_API_KEY=sk-...   # optional: without it you get the
                                      # retrieved context instead of a generated answer
    python minimal_rag.py
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass

import numpy as np
from sentence_transformers import SentenceTransformer


# ============================================================================
# 0. CORPUS  — a tiny knowledge base so the file runs out of the box.
#    Replace these strings with your own docs (load .txt/.md/.pdf -> text).
# ============================================================================
DOCUMENTS = [
    {
        "id": "solar",
        "text": (
            "Photovoltaic solar panels convert sunlight directly into electricity "
            "using semiconductor cells, usually silicon. Commercial panel efficiency "
            "ranges from roughly 18% to 23%. Output drops on cloudy days and falls to "
            "zero at night, so solar is normally paired with battery storage or a grid "
            "connection to provide power when the sun is down."
        ),
    },
    {
        "id": "battery",
        "text": (
            "A battery energy storage system, or BESS, stores electricity and releases "
            "it later. Grid operators use it to smooth the gap between intermittent "
            "renewable supply and demand. Lithium-ion is the dominant chemistry today. "
            "BESS can respond in milliseconds, which makes it valuable for frequency "
            "regulation as well as for shifting solar energy from midday into the evening."
        ),
    },
    {
        "id": "scada",
        "text": (
            "SCADA stands for Supervisory Control and Data Acquisition. It is the "
            "control system that monitors and operates industrial infrastructure such "
            "as power grids, water plants, and pipelines. A SCADA historian is the "
            "time-series database that records every sensor reading, which engineers "
            "later mine for anomaly detection and predictive maintenance."
        ),
    },
    {
        "id": "rag",
        "text": (
            "Retrieval-Augmented Generation grounds a language model in external "
            "documents. At query time the system retrieves the passages most relevant "
            "to the question and inserts them into the prompt. Because the model is "
            "told to answer only from that supplied context, RAG reduces hallucination "
            "and lets answers cite their sources, without retraining the model."
        ),
    },
    {
        "id": "embedding",
        "text": (
            "An embedding maps a piece of text to a fixed-length vector of numbers, "
            "arranged so that semantically similar text lands close together in the "
            "vector space. Retrieval works by embedding the user's question and finding "
            "the stored chunks whose vectors are nearest, typically measured by cosine "
            "similarity."
        ),
    },
]


# ============================================================================
# 1. CHUNKING
#    Long documents are split into small pieces so (a) each fits the embedder
#    and (b) retrieval is granular — you pull the one relevant paragraph, not a
#    whole file. We pack sentences into ~max_chars windows and carry a little
#    OVERLAP so context that straddles a boundary isn't lost.
#    Production swap: a token-aware splitter (e.g. tiktoken-based) by token count.
# ============================================================================
@dataclass
class Chunk:
    doc_id: str
    text: str
    embedding: np.ndarray | None = None


def chunk_text(text: str, max_chars: int = 320, overlap: int = 60) -> list[str]:
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    chunks: list[str] = []
    current = ""
    for sentence in sentences:
        if len(current) + len(sentence) + 1 <= max_chars:
            current = f"{current} {sentence}".strip()
        else:
            if current:
                chunks.append(current)
            # seed the next chunk with the tail of this one (the overlap)
            tail = current[-overlap:] if current else ""
            current = f"{tail} {sentence}".strip()
    if current:
        chunks.append(current)
    return chunks


# ============================================================================
# 2. EMBEDDING  +  3. VECTOR STORE
#    The store is just: a list of chunks + a matrix of their NORMALIZED
#    embedding vectors. Normalizing to unit length means cosine similarity is
#    simply the dot product — so a search is one matrix-vector multiply.
#    We use a small local model (all-MiniLM-L6-v2, 384 dims) so this runs
#    offline and free.
#    Production swap: FAISS / Chroma / pgvector for millions of vectors and
#    approximate nearest-neighbour search.
# ============================================================================
class VectorStore:
    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        self.model = SentenceTransformer(model_name)
        self.chunks: list[Chunk] = []
        self.matrix: np.ndarray | None = None  # shape: (n_chunks, dim)

    def _embed(self, texts: list[str]) -> np.ndarray:
        # normalize_embeddings=True -> unit vectors -> dot product == cosine sim
        return self.model.encode(texts, normalize_embeddings=True)

    def add(self, documents: list[dict]) -> None:
        # chunk every document, then embed all chunks in one batched pass
        for doc in documents:
            for piece in chunk_text(doc["text"]):
                self.chunks.append(Chunk(doc_id=doc["id"], text=piece))
        vectors = self._embed([c.text for c in self.chunks])
        for chunk, vec in zip(self.chunks, vectors):
            chunk.embedding = vec
        self.matrix = np.asarray(vectors)

    def search(self, query: str, k: int = 3) -> list[tuple[Chunk, float]]:
        query_vec = self._embed([query])[0]      # embed the question
        scores = self.matrix @ query_vec         # cosine sim vs EVERY chunk
        top_idx = np.argsort(scores)[::-1][:k]    # indices of the k highest
        return [(self.chunks[i], float(scores[i])) for i in top_idx]


# ============================================================================
# 4. RETRIEVE -> 5. AUGMENT -> 6. GENERATE
#    Stuff the retrieved chunks into the prompt as context and instruct the
#    model to answer ONLY from it. That instruction is what makes the answer
#    traceable to sources and curbs hallucination.
# ============================================================================
SYSTEM = (
    "You are a precise assistant. Answer the question using ONLY the context "
    "provided. If the answer is not in the context, say you don't know. "
    "Cite the source ids (e.g. [solar]) you relied on."
)


def build_prompt(question: str, retrieved: list[tuple[Chunk, float]]) -> str:
    context = "\n\n".join(f"[source: {c.doc_id}] {c.text}" for c, _ in retrieved)
    return f"Context:\n{context}\n\nQuestion: {question}"


def generate(question: str, retrieved: list[tuple[Chunk, float]]) -> str:
    prompt = build_prompt(question, retrieved)

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        # Fallback so the pipeline still "works" with no key: show the grounded
        # context that WOULD be sent to the model. (Matches the offline-fallback
        # pattern — the retrieval half is fully functional on its own.)
        return "[no ANTHROPIC_API_KEY set — here is the retrieved context]\n\n" + prompt

    from anthropic import Anthropic

    client = Anthropic(api_key=api_key)
    message = client.messages.create(
        model="claude-sonnet-4-6",   # swap to claude-haiku-4-5 for cheaper/faster
        max_tokens=512,
        system=SYSTEM,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


# ============================================================================
# ORCHESTRATION — tie the stages together.
# ============================================================================
def answer(store: VectorStore, question: str, k: int = 3) -> None:
    retrieved = store.search(question, k=k)
    print(f"\nQ: {question}")
    print("  retrieved:")
    for chunk, score in retrieved:
        preview = chunk.text[:72].replace("\n", " ")
        print(f"    ({score:.3f}) [{chunk.doc_id}] {preview}...")
    print("\nA:", generate(question, retrieved))
    print("-" * 78)


if __name__ == "__main__":
    store = VectorStore()

    # --- INDEXING phase (run once) ---
    store.add(DOCUMENTS)
    print(f"Indexed {len(store.chunks)} chunks from {len(DOCUMENTS)} documents.")

    # --- QUERY phase (per question) ---
    answer(store, "How efficient are solar panels and what happens at night?")
    answer(store, "What is RAG and why does it reduce hallucination?")
    answer(store, "How do you find which stored chunk matches a question?")
