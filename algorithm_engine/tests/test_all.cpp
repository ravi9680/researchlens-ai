/* Minimal self-contained C++ tests (assert-based). Build via `make test`. */
#include <cassert>
#include <cstdio>
#include <cstring>
#include <cmath>
#include <iostream>

#include "text_processing.hpp"
#include "string_matching.hpp"
#include "similarity.hpp"
#include "hash_table.hpp"
#include "inverted_index.hpp"
#include "ranking.hpp"
#include "graph.hpp"

using namespace rl;

static int passed = 0;
#define CHECK(cond, name) do { \
    if (!(cond)) { std::printf("FAIL: %s (line %d)\n", name, __LINE__); return 1; } \
    else { passed++; } \
} while (0)

int main(void) {
    /* text processing */
    std::string out;
    TextProcessor::normalize("Hello, WORLD! Phishing-URL", out);
    CHECK(out == "hello  world  phishing url", "normalize");

    TokenList tl;
    TextProcessor::tokenize(out, tl, 1);
    CHECK(tl.tokens.size() >= 3, "tokenize count");
    CHECK(TextProcessor::is_stopword("the") == 1, "stopword");
    CHECK(TextProcessor::fnv1a("abc") != TextProcessor::fnv1a("abd"), "fnv differs");

    /* string matching */
    CHECK(StringMatcher::kmp_count("aaaa", "aa") == 3, "kmp overlap");
    CHECK(StringMatcher::kmp_count("researchers demonstrated x", "demonstrated") == 1, "kmp hit");
    CHECK(StringMatcher::rk_count("aaaa", "aa") == 3, "rk overlap");
    CHECK(StringMatcher::edit_distance("kitten", "sitting") == 3, "edit distance");
    CHECK(std::abs(StringMatcher::edit_similarity("abc", "abc") - 1.0) < 1e-9, "edit sim identical");
    CHECK(StringMatcher::lcs_length("abcde", "ace") == 3, "lcs");

    /* similarity */
    TokenList a, b;
    TextProcessor::tokenize("phishing url detection machine learning", a, 1);
    TextProcessor::tokenize("phishing website detection deep learning", b, 1);
    double j = Similarity::jaccard_tokens(&a, &b);
    CHECK(j > 0.2 && j < 0.9, "jaccard range");
    double c = Similarity::cosine_tf(&a, &b);
    CHECK(c > 0.2, "cosine range");
    double t = Similarity::trigram_similarity("phishing detection", "phishing detection!");
    CHECK(t > 0.5, "trigram near-identical");
    double lex = Similarity::lexical_score("phishing url detection with xgboost",
                                           "phishing website detection using xgboost classifier");
    CHECK(lex > 0.25, "lexical related");

    /* hash table */
    HashTable ht(64);
    ht.inc("phishing"); ht.inc("phishing"); ht.inc("url");
    CHECK(ht.get("phishing") == 2, "ht count");
    CHECK(ht.get("missing") == 0, "ht missing");

    /* inverted index + tfidf */
    InvertedIndex ii;
    std::vector<std::string> d0 = {"phishing","url","detection"};
    std::vector<std::string> d1 = {"image","segmentation","vision"};
    ii.add_doc(0, d0);
    ii.add_doc(1, d1);
    std::vector<std::string> q = {"phishing","detection"};
    ScoredDoc res[4];
    int n = ii.search(q, res, 2);
    CHECK(n >= 1 && res[0].doc_id == 0, "ii search ranks phishing doc first");

    /* trie */
    TrieNode* tr = new TrieNode();
    tr->insert("phishing"); tr->insert("phish");
    CHECK(tr->search("phishing") == 1, "trie search");
    CHECK(tr->prefix_count("phis") == 2, "trie prefix");
    delete tr;

    /* ranking heap */
    MinHeap h(3);
    h.push(0, 10); h.push(1, 50); h.push(2, 30);
    h.push(3, 40); h.push(4, 5);
    RankItem rritem[4];
    int m = h.drain_desc(rritem);
    CHECK(m == 3 && rritem[0].id == 1 && rritem[0].score == 50, "heap topk");

    double s[3] = {10, 20, 30};
    normalize_0_100(s, 3);
    CHECK(std::abs(s[0]) < 1e-6 && std::abs(s[2] - 100) < 1e-6, "normalize");
    double sig[2] = {80, 60}, w[2] = {0.7, 0.3};
    CHECK(std::abs(weighted_score(sig, w, 2) - 74.0) < 1e-6, "weighted");

    /* BST */
    BSTNode* root = nullptr;
    bst_insert(&root, 2021, 0); bst_insert(&root, 2023, 1); bst_insert(&root, 2022, 2);
    CHECK(bst_count_range(root, 2021, 2022) == 2, "bst range");
    bst_free(root);

    /* graph */
    Graph g(4);
    g.add_edge(0, 1); g.add_edge(1, 2); g.add_edge(2, 3);
    int order[8], dist[8], comp[8];
    int nb = g.bfs(0, order, dist);
    CHECK(nb == 4 && dist[3] == 3, "bfs dist");
    int nd = g.dfs(0, order);
    CHECK(nd == 4, "dfs count");
    int nc = g.components(comp);
    CHECK(nc == 1, "components connected");
    CHECK(g.shortest_path(0, 3) == 3, "shortest path");
    double rank[4];
    g.pagerank(rank, 20);
    CHECK(rank[3] > rank[0], "pagerank sink higher");

    /* components must ignore edge direction: a citation chain stored as
     * citing->cited (reversed relative to the chain above) is still ONE
     * community, not one component per node. */
    Graph gr(4);
    gr.add_edge(3, 2); gr.add_edge(2, 1); gr.add_edge(1, 0);
    int compr[8];
    CHECK(gr.components(compr) == 1, "components connected (reversed edges)");
    CHECK(compr[0] == compr[3], "same component id across chain");

    /* genuinely disconnected pairs stay separate */
    Graph gd(4);
    gd.add_edge(0, 1); gd.add_edge(2, 3);
    int compd[8];
    CHECK(gd.components(compd) == 2, "components disconnected");
    CHECK(compd[0] == compd[1] && compd[0] != compd[2], "component ids differ");

    /* an isolated node forms its own component */
    Graph gi(3);
    gi.add_edge(0, 1);
    int compi[8];
    CHECK(gi.components(compi) == 2, "components with isolated node");

    std::printf("ALL C++ TESTS PASSED (%d checks)\n", passed);
    return 0;
}
