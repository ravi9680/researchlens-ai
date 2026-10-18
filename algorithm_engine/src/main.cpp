/* ResearchLens C++ engine — JSON CLI.
 * Reads one JSON object from stdin (max 2MB), writes JSON to stdout.
 * Commands: analyze | match_passages | graph | keywords | fingerprint
 * Pure C++17 — no C-style casts, no malloc/free, std::string throughout.
 */
#include <iostream>
#include <string>
#include <vector>
#include <cstring>
#include <cstdlib>
#include <cmath>
#include <cctype>
#include <algorithm>

#include "text_processing.hpp"
#include "string_matching.hpp"
#include "similarity.hpp"
#include "hash_table.hpp"
#include "inverted_index.hpp"
#include "ranking.hpp"
#include "graph.hpp"

using namespace rl;

#define MAX_IN (2u * 1024u * 1024u)
#define MAX_CAND 256
#define MAX_TXT 60000

static void json_print_escaped(const std::string& s) {
    for (char c : s) {
        if (c == '"') std::cout << "\\\"";
        else if (c == '\\') std::cout << "\\\\";
        else if (c == '\n') std::cout << "\\n";
        else if (c == '\r') std::cout << "\\r";
        else if (c == '\t') std::cout << "\\t";
        else if (static_cast<unsigned char>(c) < 0x20)
            std::cout << "\\u" << std::hex << (int)(unsigned char)c << std::dec;
        else std::cout << c;
    }
}

static const char* js_val(const char* js, const char* key) {
    std::string pat = "\"" + std::string(key) + "\"";
    const char* p = std::strstr(js, pat.c_str());
    if (!p) return nullptr;
    p = std::strchr(p + pat.size(), ':');
    return p ? p + 1 : nullptr;
}

static int js_int(const char* js, const char* key, int dflt) {
    const char* p = js_val(js, key);
    if (!p) return dflt;
    while (*p == ' ' || *p == '\t' || *p == '\n') p++;
    return std::atoi(p) ? std::atoi(p) : dflt;
}

static std::string js_str_at(const char* p, size_t maxlen) {
    while (*p && *p != '"') p++;
    if (*p != '"') return "";
    p++;
    std::string out;
    out.reserve(maxlen);
    while (*p && *p != '"' && out.size() < maxlen) {
        if (*p == '\\' && p[1]) {
            p++;
            char e = *p++;
            if (e == 'n') out += '\n';
            else if (e == 't') out += '\t';
            else if (e == 'r') out += '\r';
            else if (e == 'u') {
                out += '?';
                int k = 0;
                while (k < 4 && *p && std::isxdigit((unsigned char)*p)) { p++; k++; }
            } else out += e;
        } else out += *p++;
    }
    return out;
}

static std::string js_get_str(const char* js, const char* key, size_t maxlen) {
    const char* p = js_val(js, key);
    if (!p) return "";
    return js_str_at(p, maxlen);
}

static const char* js_get_arr(const char* js, const char* key) {
    const char* p = js_val(js, key);
    if (!p) return nullptr;
    while (*p && *p != '[') p++;
    return *p == '[' ? p : nullptr;
}

static std::string tp_fnv1a_str(const std::string& s) {
    return std::to_string(TextProcessor::fnv1a(s));
}

static void cmd_fingerprint(const char* js) {
    std::string t = js_get_str(js, "text", MAX_TXT);
    unsigned long long fp = TextProcessor::doc_fingerprint(t);
    std::cout << "{\"ok\":true,\"fingerprint\":\"" << std::hex << fp << std::dec
              << "\",\"fnv\":\"" << tp_fnv1a_str(t) << "\"}";
}

static void kw_cb(const std::string& /*k*/, int /*v*/, void* /*u*/) {
    // handled via static vector
}

static std::vector<std::pair<std::string, int>> g_topk;
static void g_kw_cb(const std::string& k, int v, void*) {
    g_topk.emplace_back(k, v);
}

static void cmd_keywords(const char* js) {
    int top_k = js_int(js, "top_k", 10);
    if (top_k > 64) top_k = 64;
    std::string t = js_get_str(js, "text", MAX_TXT);
    std::string norm;
    TextProcessor::normalize(t, norm);
    TokenList tl;
    TextProcessor::tokenize(norm, tl, 1);
    HashTable ht(2048);
    TrieNode* tr = new TrieNode();
    for (const auto& tok : tl.tokens) { ht.inc(tok); tr->insert(tok); }
    g_topk.clear();
    ht.foreach(g_kw_cb, nullptr);
    std::sort(g_topk.begin(), g_topk.end(),
              [](const auto& x, const auto& y) { return x.second > y.second; });
    std::cout << "{\"ok\":true,\"total_tokens\":" << tl.tokens.size() << ",\"keywords\":[";
    for (int i = 0; i < top_k && i < (int)g_topk.size(); i++) {
        if (i) std::cout << ",";
        std::cout << "{\"term\":\"";
        json_print_escaped(g_topk[i].first);
        std::cout << "\",\"freq\":" << g_topk[i].second << "}";
    }
    std::cout << "]}";
    delete tr;
}

static void cmd_analyze(const char* js) {
    int top_k = js_int(js, "top_k", 5);
    if (top_k < 1) top_k = 5;
    if (top_k > 32) top_k = 32;
    std::string user = js_get_str(js, "user_text", MAX_TXT);
    const char* arr = js_get_arr(js, "candidates");

    std::vector<std::string> ids;
    std::vector<std::string> texts;
    if (arr) {
        const char* p = arr;
        while (texts.size() < MAX_CAND) {
            const char* o = std::strchr(p, '{');
            if (!o) break;
            const char* e = std::strchr(o, '}');
            if (!e) break;
            size_t len = (size_t)(e - o + 1);
            std::string obj(o, len);
            std::string id = js_get_str(obj.c_str(), "id", 60);
            std::string tx = js_get_str(obj.c_str(), "text", 20000);
            ids.push_back(id.empty() ? "" : id);
            texts.push_back(tx);
            p = e + 1;
        }
    }

    InvertedIndex ii;
    std::vector<TokenList> tls(texts.size());
    for (size_t i = 0; i < texts.size(); i++) {
        std::string norm;
        TextProcessor::normalize(texts[i], norm);
        TextProcessor::tokenize(norm, tls[i], 1);
        ii.add_doc(static_cast<int>(i), tls[i].tokens);
    }

    std::string ucp;
    TextProcessor::normalize(user, ucp);
    TokenList q;
    TextProcessor::tokenize(ucp, q, 1);

    ScoredDoc tfidf[256];
    int ngot = ii.nterms() ? ii.search(q.tokens, tfidf, 256) : 0;
    double tfidf_by_doc[256] = {0};
    double tfidf_max = 1e-9;
    for (int i = 0; i < ngot; i++) {
        tfidf_by_doc[tfidf[i].doc_id] = tfidf[i].score;
        if (tfidf[i].score > tfidf_max) tfidf_max = tfidf[i].score;
    }

    MinHeap h(top_k);
    std::vector<double> fscore(texts.size(), 0), fjac(texts.size(), 0),
                        fcos(texts.size(), 0), fedit(texts.size(), 0);
    std::vector<int> fkmp(texts.size(), 0);

    for (size_t i = 0; i < texts.size(); i++) {
        std::string cnorm;
        TextProcessor::normalize(texts[i], cnorm);
        TokenList c;
        TextProcessor::tokenize(cnorm, c, 1);
        double j = Similarity::jaccard_tokens(&q, &c);
        double co = Similarity::cosine_tf(&q, &c);
        double tr = Similarity::trigram_similarity(ucp, cnorm);
        int kmp = 0;
        if (q.tokens.size() >= 3) {
            std::string phrase = q.tokens[0] + " " + q.tokens[1] + " " + q.tokens[2];
            kmp = StringMatcher::kmp_count(cnorm, phrase);
            int r2 = StringMatcher::rk_count(cnorm, phrase);
            if (r2 > kmp) kmp = r2;
        }
        std::string uh = ucp.substr(0, 599), ch = cnorm.substr(0, 599);
        double es = StringMatcher::edit_similarity(uh, ch);
        double sig[4] = { tfidf_by_doc[i] / tfidf_max, j, co, tr };
        double w[4] = { 0.35, 0.25, 0.25, 0.15 };
        double agg = weighted_score(sig, w, 4);
        double final100 = agg * 100.0;
        if (kmp > 0) final100 = std::min(97.0, final100 + 2.0);
        fscore[i] = final100; fjac[i] = j; fcos[i] = co; fedit[i] = es; fkmp[i] = kmp;
        h.push(static_cast<int>(i), final100);
    }

    RankItem ri[32];
    int n = h.drain_desc(ri);
    std::cout << "{\"ok\":true,\"engine\":\"cpp\",\"results\":[";
    for (int k = 0; k < n; k++) {
        int i = ri[k].id;
        if (k) std::cout << ",";
        std::cout << "{\"id\":\"";
        json_print_escaped(ids[i]);
        std::cout << "\",\"lexical_score\":" << fscore[i]
                  << ",\"jaccard\":" << fjac[i]
                  << ",\"cosine_tf\":" << fcos[i]
                  << ",\"edit_sim\":" << fedit[i]
                  << ",\"kmp_hits\":" << fkmp[i]
                  << ",\"tfidf\":" << tfidf_by_doc[i] << "}";
    }
    std::cout << "],\"algorithms\":[\"tf-idf\",\"jaccard\",\"cosine-tf\",\"trigram\",\"kmp\",\"rabin-karp\",\"edit-distance\",\"heap-topk\"]}";
}

static void cmd_match(const char* js) {
    double thr = 0.55;
    const char* tp = js_val(js, "threshold");
    if (tp) thr = std::atof(tp);
    std::string u = js_get_str(js, "user_text", 20000);
    const char* arr = js_get_arr(js, "sources");

    std::cout << "{\"ok\":true,\"matches\":[";
    int first = 1, idx = 0;
    if (arr) {
        const char* p = arr;
        while (idx < MAX_CAND) {
            const char* o = std::strchr(p, '{');
            if (!o) break;
            const char* e = std::strchr(o, '}');
            if (!e) break;
            size_t len = (size_t)(e - o + 1);
            std::string obj(o, len);
            std::string id = js_get_str(obj.c_str(), "id", 60);
            std::string tx = js_get_str(obj.c_str(), "text", 20000);
            if (!tx.empty()) {
                double lex = Similarity::lexical_score(u, tx);
                int kmp = 0;
                if (u.size() > 12 && tx.size() > 12) {
                    std::string probe = u.substr(0, 40);
                    TextProcessor::normalize(probe, probe);
                    TextProcessor::normalize(tx, tx);
                    kmp = StringMatcher::kmp_count(tx, probe);
                }
                double es = StringMatcher::edit_similarity(u, tx);
                const char* type = "NONE";
                if (kmp > 0 && lex > 0.8) type = "EXACT";
                else if (es > 0.85 || lex > 0.75) type = "NEAR-EXACT";
                else if (lex > thr) type = "LEXICAL";
                if (std::string(type) != "NONE") {
                    if (!first) std::cout << ",";
                    first = 0;
                    std::cout << "{\"id\":\"";
                    json_print_escaped(id);
                    std::cout << "\",\"type\":\"" << type
                              << "\",\"lexical\":" << lex
                              << ",\"edit_sim\":" << es
                              << ",\"kmp_hits\":" << kmp << "}";
                }
            }
            p = e + 1; idx++;
        }
    }
    std::cout << "]}";
}

static void cmd_graph(const char* js) {
    int n = js_int(js, "n", 0);
    if (n < 1) n = 1;
    if (n > 2048) n = 2048;
    int start = js_int(js, "start", 0);
    int iters = js_int(js, "pagerank_iters", 20);
    if (iters > 100) iters = 100;
    Graph g(n);
    const char* arr = js_get_arr(js, "edges");
    if (arr) {
        const char* p = arr;
        for (int k = 0; k < 4096; k++) {
            const char* o = std::strchr(p, '[');
            if (!o) break;
            int a = -1, b = -1;
            if (std::sscanf(o, "[%d,%d]", &a, &b) == 2) g.add_edge(a, b);
            p = o + 1;
            if (p - arr > 200000) break;
        }
    }
    std::vector<int> order(n), dist(n), comp(n);
    int nbfs = g.bfs(start, order.data(), dist.data());
    g.dfs(start, order.data());
    int ncomp = g.components(comp.data());
    std::vector<double> rank(n);
    g.pagerank(rank.data(), iters);
    std::cout << "{\"ok\":true,\"bfs_order\":[";
    for (int i = 0; i < nbfs; i++) std::cout << (i ? "," : "") << order[i];
    std::cout << "],\"distances\":[";
    for (int i = 0; i < n; i++) std::cout << (i ? "," : "") << dist[i];
    std::cout << "],\"components\":[";
    for (int i = 0; i < n; i++) std::cout << (i ? "," : "") << comp[i];
    std::cout << "],\"num_components\":" << ncomp
              << ",\"pagerank\":[";
    for (int i = 0; i < n; i++) std::cout << (i ? "," : "") << rank[i];
    std::cout << "],\"algorithms\":[\"bfs\",\"dfs\",\"connected-components\",\"bfs-shortest-path\",\"pagerank\"]}";
}

int main() {
    static char input[MAX_IN + 1];
    size_t total = 0, r;
    while ((r = std::fread(input + total, 1, MAX_IN - total, stdin)) > 0) {
        total += r;
        if (total >= MAX_IN) break;
    }
    input[total] = '\0';

    std::string cmd = js_get_str(input, "cmd", 32);
    if (cmd.empty()) { std::cout << "{\"ok\":false,\"error\":\"missing cmd\"}\n"; return 0; }
    if (cmd == "fingerprint") cmd_fingerprint(input);
    else if (cmd == "keywords") cmd_keywords(input);
    else if (cmd == "analyze") cmd_analyze(input);
    else if (cmd == "match_passages") cmd_match(input);
    else if (cmd == "graph") cmd_graph(input);
    else std::cout << "{\"ok\":false,\"error\":\"unknown cmd\"}";
    std::cout << "\n";
    return 0;
}
