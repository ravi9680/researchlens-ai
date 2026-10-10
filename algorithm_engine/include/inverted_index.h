#ifndef INVERTED_INDEX_H
#define INVERTED_INDEX_H

#define II_MAX_DOCS 4096
#define II_MAX_TERMS 16384

typedef struct {
    int doc_id;
    int freq;
} Posting;

typedef struct {
    char term[64];
    Posting *postings; /* dynamic array */
    int n, cap;
    int doc_freq;
} TermEntry;

typedef struct {
    TermEntry *terms;
    int nterms;
    int ndocs;
    int *doc_lens;
} InvertedIndex;

void ii_init(InvertedIndex *ii);
void ii_free(InvertedIndex *ii);
/* Add one tokenized document (tokens array of C strings). */
void ii_add_doc(InvertedIndex *ii, int doc_id, char tokens[][64], int ntok);
typedef struct { int doc_id; double score; } ScoredDoc;
/* TF-IDF ranked retrieval. Returns heap-selected top-k (desc). */
int ii_search(InvertedIndex *ii, char query[][64], int nq, ScoredDoc *out, int top_k);

/* Trie for keyword/prefix search */
typedef struct TrieNode {
    struct TrieNode *child[26];
    int is_end;
    int count;
} TrieNode;

TrieNode *trie_create(void);
void trie_free(TrieNode *n);
void trie_insert(TrieNode *root, const char *word);
int trie_search(TrieNode *root, const char *word);
int trie_prefix_count(TrieNode *root, const char *prefix);

#endif
