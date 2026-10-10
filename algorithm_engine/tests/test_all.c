/* Minimal self-contained C tests (assert-based). Build via `make test`. */
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include <math.h>
#include "text_processing.h"
#include "string_matching.h"
#include "similarity.h"
#include "hash_table.h"
#include "inverted_index.h"
#include "ranking.h"
#include "graph.h"

static int passed = 0;
#define CHECK(cond, name) do { \
    if (!(cond)) { printf("FAIL: %s (line %d)\n", name, __LINE__); return 1; } \
    else { passed++; } \
} while (0)

int main(void) {
    /* text processing */
    char out[128];
    tp_normalize("Hello, WORLD! Phishing-URL", out, sizeof out);
    CHECK(strcmp(out, "hello  world  phishing url") == 0, "normalize");
    TokenList tl;
    tp_tokenize(out, &tl, 1);
    CHECK(tl.count >= 3, "tokenize count");
    CHECK(tp_is_stopword("the") == 1, "stopword");
    CHECK(tp_fnv1a("abc") != tp_fnv1a("abd"), "fnv differs");

    /* string matching */
    CHECK(kmp_count("aaaa", "aa") == 3, "kmp overlap");
    CHECK(kmp_count("researchers demonstrated x", "demonstrated") == 1, "kmp hit");
    CHECK(rk_count("aaaa", "aa") == 3, "rk overlap");
    CHECK(edit_distance("kitten", "sitting") == 3, "edit distance");
    CHECK(edit_similarity("abc", "abc") == 1.0, "edit sim identical");
    CHECK(lcs_length("abcde", "ace") == 3, "lcs");

    /* similarity */
    TokenList a, b;
    tp_tokenize("phishing url detection machine learning", &a, 1);
    tp_tokenize("phishing website detection deep learning", &b, 1);
    double j = jaccard_tokens(&a, &b);
    CHECK(j > 0.2 && j < 0.9, "jaccard range");
    double c = cosine_tf(&a, &b);
    CHECK(c > 0.2, "cosine range");
    double t = trigram_similarity("phishing detection", "phishing detection!");
    CHECK(t > 0.5, "trigram near-identical");
    double lex = lexical_score("phishing url detection with xgboost", "phishing website detection using xgboost classifier");
    CHECK(lex > 0.25, "lexical related");

    /* hash table */
    HashTable *ht = ht_create(64);
    ht_inc(ht, "phishing"); ht_inc(ht, "phishing"); ht_inc(ht, "url");
    CHECK(ht_get(ht, "phishing") == 2, "ht count");
    CHECK(ht_get(ht, "missing") == 0, "ht missing");
    ht_free(ht);

    /* inverted index + tfidf */
    InvertedIndex ii; ii_init(&ii);
    char d0[][64] = {"phishing","url","detection"};
    char d1[][64] = {"image","segmentation","vision"};
    ii_add_doc(&ii, 0, d0, 3);
    ii_add_doc(&ii, 1, d1, 3);
    char q[][64] = {"phishing","detection"};
    ScoredDoc res[4];
    int n = ii_search(&ii, q, 2, res, 2);
    CHECK(n >= 1 && res[0].doc_id == 0, "ii search ranks phishing doc first");
    ii_free(&ii);

    /* trie */
    TrieNode *tr = trie_create();
    trie_insert(tr, "phishing"); trie_insert(tr, "phish");
    CHECK(trie_search(tr, "phishing") == 1, "trie search");
    CHECK(trie_prefix_count(tr, "phis") == 2, "trie prefix");
    trie_free(tr);

    /* ranking heap */
    MinHeap h; heap_init(&h, 3);
    heap_push(&h, 0, 10); heap_push(&h, 1, 50); heap_push(&h, 2, 30);
    heap_push(&h, 3, 40); heap_push(&h, 4, 5);
    RankItem ri[4];
    int m = heap_drain_desc(&h, ri);
    CHECK(m == 3 && ri[0].id == 1 && ri[0].score == 50, "heap topk");
    heap_free(&h);
    double s[3] = {10, 20, 30};
    normalize_0_100(s, 3);
    CHECK(fabs(s[0]) < 1e-6 && fabs(s[2] - 100) < 1e-6, "normalize");
    double sig[2] = {80, 60}, w[2] = {0.7, 0.3};
    CHECK(fabs(weighted_score(sig, w, 2) - 74.0) < 1e-6, "weighted");

    /* BST */
    BSTNode *root = NULL;
    bst_insert(&root, 2021, 0); bst_insert(&root, 2023, 1); bst_insert(&root, 2022, 2);
    CHECK(bst_count_range(root, 2021, 2022) == 2, "bst range");
    bst_free(root);

    /* graph */
    Graph g; g_init(&g, 4);
    g_add_edge(&g, 0, 1); g_add_edge(&g, 1, 2); g_add_edge(&g, 2, 3);
    int order[8], dist[8], comp[8];
    int nb = g_bfs(&g, 0, order, dist);
    CHECK(nb == 4 && dist[3] == 3, "bfs dist");
    int nd = g_dfs(&g, 0, order);
    CHECK(nd == 4, "dfs count");
    int nc = g_components(&g, comp);
    CHECK(nc == 1, "components connected");
    CHECK(g_shortest_path(&g, 0, 3) == 3, "shortest path");
    double rank[4];
    g_pagerank(&g, rank, 20);
    CHECK(rank[3] > rank[0], "pagerank sink higher");
    g_free(&g);

    printf("ALL C TESTS PASSED (%d checks)\n", passed);
    return 0;
}
