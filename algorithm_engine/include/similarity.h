#ifndef SIMILARITY_H
#define SIMILARITY_H
#include "text_processing.h"

/* Jaccard over token sets. */
double jaccard_tokens(TokenList *a, TokenList *b);
/* Cosine over sparse term-frequency maps represented as token lists. */
double cosine_tf(TokenList *a, TokenList *b);
/* Char-trigram Jaccard (robust near-exact passage comparison). */
double trigram_similarity(const char *a, const char *b);
/* Weighted lexical aggregate: 0.4 tfidf-cos + 0.3 jaccard + 0.3 trigram. */
double lexical_score(const char *a, const char *b);

#endif
