# AI Analysis (honesty contract)

**Similarity ≠ plagiarism.** Scores measure *relatedness* (shared topic,
methods, wording). Labels: EXACT (identical/long-substring), NEAR-EXACT
(fuzzy>0.85), SEMANTIC (embedding-driven), CONCEPTUAL (weak topical).
Only EXACT/NEAR-EXACT with visible quoted overlap warrant a closer look —
and even those may be boilerplate, quotes, or common phrasing.

**AI-writing signals are probabilistic.** Features: sentence-length CV
(burstiness), type-token ratio, generic-transition rate, trigram repetition,
cross-section regularity, marketing-phrase density → 0–100 →
LOW (<28) / MODERATE (28–54) / HIGH (≥55). Every result ships the disclaimer:
*probabilistic; false positives/negatives possible; never proof of authorship.*
The Results page lists the exact contributing reasons and flagged sections.

**Embeddings:** local 384-d hashed vectors (deterministic, offline) behind a
modular provider boundary (`localEmbed` ↔ future OpenAI/Cohere). C engine does
*lexical* ranking; fusion is a weighted aggregate, reported per-paper
(`lexical{score,jaccard,tfidf,kmpHits}`) so reviewers see both signals.

**Grounded generation:** chat and literature-review answers cite only retrieved
chunks/papers; insufficient evidence → explicit abstention
("I couldn't find enough evidence…"). Demo papers are synthetic and badged;
real ingestion uses OpenAlex/Crossref/arXiv metadata + permitted abstracts.
Never invent DOIs, authors, or citation counts.
