#ifndef TEXT_PROCESSING_H
#define TEXT_PROCESSING_H
#include <stddef.h>

#define TP_MAX_TOKENS 8192
#define TP_MAX_TOKEN_LEN 64

typedef struct {
    char tokens[TP_MAX_TOKENS][TP_MAX_TOKEN_LEN];
    int count;
} TokenList;

/* Normalize: lowercase, strip punctuation -> spaces. out must hold strlen(in)+1 */
void tp_normalize(const char *in, char *out, size_t out_sz);
/* Tokenize normalized text; filters stopwords when filter_stop=1 */
void tp_tokenize(const char *normalized, TokenList *out, int filter_stop);
int tp_is_stopword(const char *tok);
/* FNV-1a 64-bit (non-cryptographic fingerprint; NOT for security) */
unsigned long long tp_fnv1a(const char *s);
/* Shingle fingerprint: hashes sorted trigram sample */
unsigned long long tp_doc_fingerprint(const char *text);

#endif
