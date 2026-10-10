#include "inverted_index.h"
#include "ranking.h"
#include <stdlib.h>
#include <string.h>
#include <math.h>

void ii_init(InvertedIndex *ii) {
    ii->terms = NULL; ii->nterms = 0; ii->ndocs = 0; ii->doc_lens = NULL;
}

void ii_free(InvertedIndex *ii) {
    for (int i = 0; i < ii->nterms; i++) free(ii->terms[i].postings);
    free(ii->terms); free(ii->doc_lens);
    ii_init(ii);
}

static TermEntry *ii_find(InvertedIndex *ii, const char *term) {
    for (int i = 0; i < ii->nterms && i < II_MAX_TERMS; i++)
        if (strcmp(ii->terms[i].term, term) == 0) return &ii->terms[i];
    return NULL;
}

static TermEntry *ii_get_or_create(InvertedIndex *ii, const char *term) {
    TermEntry *e = ii_find(ii, term);
    if (e) return e;
    if (ii->nterms >= II_MAX_TERMS) return NULL;
    TermEntry *nt = realloc(ii->terms, sizeof(TermEntry) * (size_t)(ii->nterms + 1));
    if (!nt) return NULL;
    ii->terms = nt;
    e = &ii->terms[ii->nterms++];
    strncpy(e->term, term, sizeof(e->term) - 1);
    e->term[sizeof(e->term) - 1] = 0;
    e->postings = NULL; e->n = 0; e->cap = 0; e->doc_freq = 0;
    return e;
}

void ii_add_doc(InvertedIndex *ii, int doc_id, char tokens[][64], int ntok) {
    if (doc_id >= II_MAX_DOCS) return;
    int *nl = realloc(ii->doc_lens, sizeof(int) * (size_t)(doc_id + 1 > ii->ndocs ? doc_id + 1 : ii->ndocs));
    if (nl) {
        if (doc_id >= ii->ndocs) {
            for (int i = ii->ndocs; i <= doc_id; i++) nl[i] = 0;
            ii->ndocs = doc_id + 1;
        }
        ii->doc_lens = nl;
        ii->doc_lens[doc_id] = ntok;
    }
    for (int i = 0; i < ntok; i++) {
        TermEntry *e = ii_get_or_create(ii, tokens[i]);
        if (!e) continue;
        int k;
        for (k = 0; k < e->n; k++)
            if (e->postings[k].doc_id == doc_id) { e->postings[k].freq++; break; }
        if (k == e->n) {
            if (e->n == e->cap) {
                int nc = e->cap ? e->cap * 2 : 4;
                Posting *np = realloc(e->postings, sizeof(Posting) * (size_t)nc);
                if (!np) continue;
                e->postings = np; e->cap = nc;
            }
            e->postings[e->n].doc_id = doc_id;
            e->postings[e->n].freq = 1;
            e->n++; e->doc_freq = e->n;
        }
    }
}

/* TF-IDF cosine-ish scoring with heap top-K. */
int ii_search(InvertedIndex *ii, char query[][64], int nq, ScoredDoc *out, int top_k) {
    static double scores[II_MAX_DOCS];
    for (int i = 0; i < ii->ndocs && i < II_MAX_DOCS; i++) scores[i] = 0;
    for (int q = 0; q < nq; q++) {
        TermEntry *e = ii_find(ii, query[q]);
        if (!e || !e->doc_freq) continue;
        double idf = log((1.0 + ii->ndocs) / (1.0 + e->doc_freq)) + 1.0;
        for (int k = 0; k < e->n; k++) {
            int d = e->postings[k].doc_id;
            if (d < 0 || d >= II_MAX_DOCS || d >= ii->ndocs) continue;
            double tf = 1.0 + log((double)e->postings[k].freq);
            double norm = ii->doc_lens && ii->doc_lens[d] ? sqrt((double)ii->doc_lens[d]) : 1.0;
            scores[d] += (tf * idf) / norm;
        }
    }
    MinHeap h; heap_init(&h, top_k > 0 ? top_k : 10);
    for (int d = 0; d < ii->ndocs && d < II_MAX_DOCS; d++)
        if (scores[d] > 0) heap_push(&h, d, scores[d]);
    RankItem tmp[256];
    int got = heap_drain_desc(&h, tmp);
    for (int i = 0; i < got; i++) { out[i].doc_id = tmp[i].id; out[i].score = tmp[i].score; }
    heap_free(&h);
    return got;
}

/* ---- Trie ---- */
TrieNode *trie_create(void) { return calloc(1, sizeof(TrieNode)); }

void trie_free(TrieNode *n) {
    if (!n) return;
    for (int i = 0; i < 26; i++) trie_free(n->child[i]);
    free(n);
}

void trie_insert(TrieNode *root, const char *word) {
    TrieNode *n = root;
    for (; *word; word++) {
        char c = *word;
        if (c >= 'A' && c <= 'Z') c += 32;
        if (c < 'a' || c > 'z') continue;
        int k = c - 'a';
        if (!n->child[k]) n->child[k] = trie_create();
        if (!n->child[k]) return;
        n = n->child[k];
    }
    n->is_end = 1; n->count++;
}

int trie_search(TrieNode *root, const char *word) {
    TrieNode *n = root;
    for (; *word; word++) {
        char c = *word;
        if (c >= 'A' && c <= 'Z') c += 32;
        if (c < 'a' || c > 'z') continue;
        n = n->child[c - 'a'];
        if (!n) return 0;
    }
    return n->is_end ? n->count : 0;
}

static int trie_subtree(TrieNode *n) {
    if (!n) return 0;
    int s = n->count;
    for (int i = 0; i < 26; i++) s += trie_subtree(n->child[i]);
    return s;
}

int trie_prefix_count(TrieNode *root, const char *prefix) {
    TrieNode *n = root;
    for (; *prefix; prefix++) {
        char c = *prefix;
        if (c >= 'A' && c <= 'Z') c += 32;
        if (c < 'a' || c > 'z') continue;
        n = n->child[c - 'a'];
        if (!n) return 0;
    }
    return trie_subtree(n);
}
