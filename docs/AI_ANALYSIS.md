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

**The score is never shown alone.** The report carries `ai.metrics` — the raw
measurements behind it:

| Metric | Meaning | Flagged when |
|---|---|---|
| `sentenceLengthCv` | coefficient of variation of sentence length | < 0.35 (high signal) |
| `typeTokenRatio` | unique tokens / total tokens | < 0.32 |
| `transitionsPer1k` | generic connectives per 1,000 words | > 2.5 |
| `repeatedTrigrams` | distinct 3-word phrases seen 3+ times | > 6 |
| `sectionRegularity` | standard deviation of per-section mean sentence length | < 3 |

`ai.flaggedSections` lists the sections that **actually drove** the signal —
each is profiled on the same five features and reported with the reason it
was chosen. (The previous implementation flagged the first three sections of
the document regardless of their content, which told the reader nothing.)

**Embeddings:** local 384-d hashed vectors (deterministic, offline) behind a
modular provider boundary (`localEmbedWeighted` ↔ `openaiEmbedBatch`). Both
providers share one hashing implementation (`services/hashing.ts`) so the
scheme can never drift. The C++ engine does *lexical* ranking; fusion is a
weighted aggregate, reported per-paper (`lexical{score,jaccard,tfidf,kmpHits}`)
so reviewers see both signals.

**Provider swapping actually works.** `npm run reembed` re-embeds every chunk
with the *active* provider — it previously called the synchronous local
embedder, so `EMBEDDING_PROVIDER=openai` silently produced local vectors and
the stored index never matched the setting.

**Grounded generation:** chat and literature-review answers cite only retrieved
chunks/papers; insufficient evidence → explicit abstention
("I couldn't find enough evidence…"). Literature-review themes are real
technical phrases — a unigram or bigram that recurs across **at least two**
retrieved papers, plus the curated topic labels attached to them — not the
longest words in the abstracts. Demo papers are synthetic and badged; real
ingestion uses OpenAlex metadata + permitted abstracts, with the abstract
rebuilt from OpenAlex's inverted index so the corpus is actually searchable.
Never invent DOIs, authors, or citation counts.
