"""Build a local semantic-search index over the .cache/pdfs/ corpus.

Why this exists:
  The cached job-ad PDFs are the empirical primary documents this dissertation
  rests on. As the corpus grows (every scrape extends it) priors should
  update FROM the corpus, not from training-data generalisations about the
  Indian academic system. This index makes that easy: query "women candidates
  encouraged to apply", "Professor of Practice", "suitable candidates not
  found", "ad-hoc faculty contract", and pull out the actual prose so you
  can read what institutions actually said.

Design choices:
  - Embeddings via fastembed (BAAI/bge-small-en-v1.5, 384-dim, ~80MB ONNX).
    No torch required, runs on CPU, works offline after first model fetch.
    Install: `pip install fastembed`
  - Chunking is paragraph-aware: split on blank lines, then merge tiny
    paragraphs forward until each chunk is ≥200 chars. Caps at 1200 chars
    so embeddings are well-conditioned.
  - Storage is plain JSONL + numpy. No vector-DB dependency. For a corpus
    of <100k chunks this is faster than spinning up Chroma/Faiss/Qdrant.
  - `pdftotext -layout` (Poppler) is the text-extraction tool because it
    preserves the column layout that pdfplumber/pdfminer butcher on the
    multi-column annexures common in IIT advertisements.

Run:
  python scripts/corpus_index.py build      # rebuild from .cache/pdfs/
  python scripts/corpus_index.py query "professor of practice"
  python scripts/corpus_index.py query "suitable candidates not found" -k 8
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterator, Optional

PROJECT_ROOT = Path(__file__).resolve().parents[1]
# These are defaults; the CLI accepts --pdf-dir / --corpus-dir to point at a
# different corpus (e.g. the parliamentary corpus at corpus/pdfs_combined/).
PDF_DIR = PROJECT_ROOT / ".cache" / "pdfs"
CORPUS_DIR = PROJECT_ROOT / "corpus"
CHUNKS_PATH = CORPUS_DIR / "chunks.jsonl"
VECTORS_PATH = CORPUS_DIR / "embeddings.npy"
MODEL_NAME = "BAAI/bge-small-en-v1.5"  # 384-dim, ~80MB ONNX


@dataclass
class Chunk:
    chunk_id: str          # f"{pdf_stem}#{idx}"
    pdf: str               # filename
    idx: int               # position within the PDF
    char_start: int
    char_end: int
    text: str


# ---------------------------------------------------------------------------
# text extraction + chunking
# ---------------------------------------------------------------------------

def extract_pdf_text(path: Path) -> str:
    """`pdftotext -layout` preserves multi-column layout. Falls back to
    pdfminer if the binary is unavailable."""
    try:
        out = subprocess.run(
            ["pdftotext", "-layout", str(path), "-"],
            capture_output=True, text=True, timeout=60, check=False,
        )
        if out.returncode == 0 and out.stdout.strip():
            return out.stdout
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    try:
        from pdfminer.high_level import extract_text  # noqa: WPS433
        return extract_text(str(path))
    except Exception:  # noqa: BLE001
        return ""


PARA_SPLIT_RE = re.compile(r"\n\s*\n+")


def chunk_text(
    text: str,
    *,
    min_chunk: int = 200,
    max_chunk: int = 1200,
) -> Iterator[tuple[int, int, str]]:
    """Yield (char_start, char_end, text) tuples.

    Paragraph-first: split on blank lines, then forward-merge tiny paragraphs
    so each emitted chunk holds ≥min_chunk characters. Long paragraphs are
    hard-cut at sentence boundaries near max_chunk. The char ranges refer
    back into the original `text`, so we can show citations on retrieval.
    """
    text = text.replace("\r", "")
    if not text.strip():
        return
    # Walk paragraphs by their position in `text` so char offsets are real.
    pos = 0
    paras: list[tuple[int, int, str]] = []
    for m in PARA_SPLIT_RE.finditer(text):
        end = m.start()
        if end > pos and text[pos:end].strip():
            paras.append((pos, end, text[pos:end]))
        pos = m.end()
    if pos < len(text) and text[pos:].strip():
        paras.append((pos, len(text), text[pos:]))

    buf_start: Optional[int] = None
    buf_end = 0
    buf_parts: list[str] = []

    def flush():
        nonlocal buf_start, buf_end, buf_parts
        if buf_start is not None and buf_parts:
            joined = "\n\n".join(buf_parts).strip()
            if joined:
                yield_val = (buf_start, buf_end, joined)
                buf_start = None
                buf_end = 0
                buf_parts = []
                return yield_val
        buf_start = None
        buf_end = 0
        buf_parts = []
        return None

    for pstart, pend, ptext in paras:
        # If a single paragraph exceeds max_chunk, hard-split on sentence ends.
        if pend - pstart > max_chunk:
            sentences = re.split(r"(?<=[.!?])\s+", ptext)
            cur_start = pstart
            cur_buf: list[str] = []
            cur_len = 0
            for s in sentences:
                if cur_len + len(s) > max_chunk and cur_buf:
                    chunk_str = " ".join(cur_buf).strip()
                    if chunk_str:
                        yield (cur_start, cur_start + len(chunk_str), chunk_str)
                    cur_start += len(chunk_str) + 1
                    cur_buf = []
                    cur_len = 0
                cur_buf.append(s)
                cur_len += len(s) + 1
            if cur_buf:
                chunk_str = " ".join(cur_buf).strip()
                if chunk_str:
                    yield (cur_start, cur_start + len(chunk_str), chunk_str)
            continue

        if buf_start is None:
            buf_start = pstart
        buf_parts.append(ptext)
        buf_end = pend
        if sum(len(p) for p in buf_parts) >= min_chunk:
            joined = "\n\n".join(buf_parts).strip()
            if joined:
                yield (buf_start, buf_end, joined)
            buf_start = None
            buf_end = 0
            buf_parts = []

    if buf_parts:
        joined = "\n\n".join(buf_parts).strip()
        if joined and buf_start is not None:
            yield (buf_start, buf_end, joined)


# ---------------------------------------------------------------------------
# index build / load
# ---------------------------------------------------------------------------

def build_chunks() -> list[Chunk]:
    chunks: list[Chunk] = []
    pdfs = sorted(PDF_DIR.glob("*.pdf"))
    if not pdfs:
        print(f"[warn] no PDFs in {PDF_DIR}; nothing to index", file=sys.stderr)
        return chunks
    for pdf in pdfs:
        text = extract_pdf_text(pdf)
        if not text.strip():
            print(f"[warn] empty extraction: {pdf.name}", file=sys.stderr)
            continue
        for idx, (cs, ce, t) in enumerate(chunk_text(text)):
            chunks.append(Chunk(
                chunk_id=f"{pdf.stem}#{idx}",
                pdf=pdf.name,
                idx=idx,
                char_start=cs,
                char_end=ce,
                text=t,
            ))
        print(f"[ok] {pdf.name}: {sum(1 for c in chunks if c.pdf == pdf.name)} chunks",
              file=sys.stderr)
    return chunks


def write_chunks(chunks: list[Chunk]) -> None:
    CORPUS_DIR.mkdir(exist_ok=True)
    with CHUNKS_PATH.open("w", encoding="utf-8") as f:
        for c in chunks:
            f.write(json.dumps(asdict(c), ensure_ascii=False) + "\n")


def read_chunks() -> list[Chunk]:
    if not CHUNKS_PATH.exists():
        return []
    out: list[Chunk] = []
    with CHUNKS_PATH.open("r", encoding="utf-8") as f:
        for line in f:
            d = json.loads(line)
            out.append(Chunk(**d))
    return out


def embed_chunks(texts: list[str], batch_size: int = 64):
    """Returns numpy array (n, dim). Embeds in batches with progress logs;
    fastembed itself accepts a list and returns a generator, but we wrap so
    that we can report progress on long runs."""
    try:
        from fastembed import TextEmbedding  # type: ignore
    except ImportError as e:
        print(
            "[error] fastembed not installed. Run:\n"
            f"    {sys.executable} -m pip install fastembed numpy\n"
            "Then re-run `python scripts/corpus_index.py build`.",
            file=sys.stderr,
        )
        raise SystemExit(1) from e
    import numpy as np  # type: ignore
    import time as _time
    print(f"[info] loading {MODEL_NAME}...", file=sys.stderr, flush=True)
    t0 = _time.time()
    model = TextEmbedding(model_name=MODEL_NAME)
    print(f"[info] model loaded in {_time.time()-t0:.1f}s; embedding {len(texts)} chunks in batches of {batch_size}",
          file=sys.stderr, flush=True)
    out = []
    t0 = _time.time()
    done = 0
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        out.extend(model.embed(batch))
        done += len(batch)
        elapsed = _time.time() - t0
        rate = done / elapsed if elapsed > 0 else 0
        eta = (len(texts) - done) / rate if rate > 0 else 0
        print(f"[embed] {done}/{len(texts)} chunks  ({rate:.1f}/s, eta {eta:.0f}s)",
              file=sys.stderr, flush=True)
    return np.array(out, dtype="float32")


def build_index() -> None:
    chunks = build_chunks()
    if not chunks:
        return
    write_chunks(chunks)
    vecs = embed_chunks([c.text for c in chunks])
    import numpy as np  # type: ignore
    np.save(VECTORS_PATH, vecs)
    print(f"[ok] built {len(chunks)} chunks → {VECTORS_PATH.name}", file=sys.stderr)


def query_index(q: str, k: int = 5) -> None:
    chunks = read_chunks()
    if not chunks:
        print("[error] no index. Run `python scripts/corpus_index.py build` first.",
              file=sys.stderr)
        raise SystemExit(1)
    if not VECTORS_PATH.exists():
        print(f"[error] {VECTORS_PATH} missing.", file=sys.stderr)
        raise SystemExit(1)
    import numpy as np  # type: ignore
    vecs = np.load(VECTORS_PATH)
    qvec = embed_chunks([q])[0]
    # cosine similarity
    qn = qvec / (np.linalg.norm(qvec) + 1e-9)
    vn = vecs / (np.linalg.norm(vecs, axis=1, keepdims=True) + 1e-9)
    sims = vn @ qn
    top = np.argsort(-sims)[:k]
    for rank, i in enumerate(top, 1):
        c = chunks[i]
        snippet = c.text.strip()
        if len(snippet) > 600:
            snippet = snippet[:600] + " …"
        print(f"\n=== [{rank}] sim={sims[i]:.3f}  {c.pdf}#chunk{c.idx} "
              f"(chars {c.char_start}–{c.char_end}) ===")
        print(snippet)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    global PDF_DIR, CORPUS_DIR, CHUNKS_PATH, VECTORS_PATH
    ap = argparse.ArgumentParser(description="Local semantic search over PDF corpus.")
    ap.add_argument("--pdf-dir", help="Override PDF source directory.")
    ap.add_argument("--corpus-dir", help="Override corpus output directory (chunks + embeddings).")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("build", help="Re-extract, re-chunk, re-embed all PDFs.")
    qp = sub.add_parser("query", help="Top-k nearest chunks for a query.")
    qp.add_argument("text", type=str, help="Query string.")
    qp.add_argument("-k", type=int, default=5, help="Number of results (default 5).")
    sub.add_parser("stats", help="Print index size summary.")
    args = ap.parse_args()
    if args.pdf_dir:
        PDF_DIR = Path(args.pdf_dir).resolve()
    if args.corpus_dir:
        CORPUS_DIR = Path(args.corpus_dir).resolve()
        CHUNKS_PATH = CORPUS_DIR / "chunks.jsonl"
        VECTORS_PATH = CORPUS_DIR / "embeddings.npy"
    if args.cmd == "build":
        build_index()
    elif args.cmd == "query":
        query_index(args.text, k=args.k)
    elif args.cmd == "stats":
        chunks = read_chunks()
        pdfs = {c.pdf for c in chunks}
        print(f"chunks: {len(chunks)}  pdfs: {len(pdfs)}  index: "
              f"{'present' if VECTORS_PATH.exists() else 'missing'}")


if __name__ == "__main__":
    main()
