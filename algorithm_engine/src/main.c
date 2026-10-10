/* ResearchLens C engine — JSON CLI.
 * Reads one JSON object from stdin (max 2MB), writes JSON to stdout.
 * Commands: analyze | match_passages | graph | keywords | fingerprint
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <math.h>
#include "text_processing.h"
#include "string_matching.h"
#include "similarity.h"
#include "hash_table.h"
#include "inverted_index.h"
#include "ranking.h"
#include "graph.h"

#define MAX_IN (2u * 1024u * 1024u)
#define MAX_CAND 256
#define MAX_TXT 60000

static void json_print_escaped(const char *s) {
    for (; *s; s++) {
        unsigned char c = (unsigned char)*s;
        if (c == '"') printf("\\\"");
        else if (c == '\\') printf("\\\\");
        else if (c == '\n') printf("\\n");
        else if (c == '\r') printf("\\r");
        else if (c == '\t') printf("\\t");
        else if (c < 0x20) printf("\\u%04x", c);
        else putchar(c);
    }
}

/* find "key" then ':' ; returns pointer after ':' or NULL */
static const char *js_val(const char *js, const char *key) {
    char pat[128];
    snprintf(pat, sizeof pat, "\"%s\"", key);
    const char *p = strstr(js, pat);
    if (!p) return NULL;
    p = strchr(p + strlen(pat), ':');
    return p ? p + 1 : NULL;
}

static int js_int(const char *js, const char *key, int dflt) {
    const char *p = js_val(js, key);
    if (!p) return dflt;
    while (*p == ' ' || *p == '\t' || *p == '\n') p++;
    return atoi(p) ? atoi(p) : dflt;
}

/* extract JSON string at p (p -> first '"' ...). Returns malloc'd unescaped. */
static char *js_str_at(const char *p, size_t maxlen) {
    while (*p && *p != '"') p++;
    if (*p != '"') return NULL;
    p++;
    char *out = malloc(maxlen + 1);
    if (!out) return NULL;
    size_t j = 0;
    while (*p && *p != '"' && j < maxlen) {
        if (*p == '\\' && p[1]) {
            p++;
            char e = *p++;
            if (e == 'n') out[j++] = '\n';
            else if (e == 't') out[j++] = '\t';
            else if (e == 'r') out[j++] = '\r';
            else if (e == 'u' && isxdigit((unsigned char)p[0])) {
                /* minimal \uXXXX -> '?' for non-ascii */
                out[j++] = '?';
                int k = 0;
                while (k < 4 && isxdigit((unsigned char)*p)) { p++; k++; }
            } else out[j++] = e;
        } else out[j++] = *p++;
    }
    out[j] = 0;
    return out;
}

static char *js_get_str(const char *js, const char *key, size_t maxlen) {
    const char *p = js_val(js, key);
    if (!p) return NULL;
    return js_str_at(p, maxlen);
}

static const char *js_get_arr(const char *js, const char *key) {
    const char *p = js_val(js, key);
    if (!p) return NULL;
    while (*p && *p != '[') p++;
    return *p == '[' ? p : NULL;
}

/* ---- commands ---- */

static void cmd_fingerprint(const char *js) {
    char *t = js_get_str(js, "text", MAX_TXT);
    if (!t) t = calloc(1, 1);
    unsigned long long fp = tp_doc_fingerprint(t ? t : "");
    printf("{\"ok\":true,\"fingerprint\":\"%llx\",\"fnv\":\"%llu\"}", fp, tp_fnv1a(t ? t : ""));
    free(t);
}

typedef struct { char keybuf[64]; int val; } TopKV;
static TopKV g_top[64]; static int g_topn = 0; static int g_tot = 0;
static void kw_cb(const char *k, int v, void *u) {
    (void)u; g_tot += v;
    int pos = g_topn;
    if (g_topn < 64) g_topn++;
    else {
        int mn = 0;
        for (int i = 1; i < 64; i++) if (g_top[i].val < g_top[mn].val) mn = i;
        if (v <= g_top[mn].val) return;
        pos = mn;
    }
    strncpy(g_top[pos].keybuf, k, 63); g_top[pos].keybuf[63] = 0;
    g_top[pos].val = v;
}
static int kw_cmp(const void *a, const void *b) { return ((TopKV*)b)->val - ((TopKV*)a)->val; }

static void cmd_keywords(const char *js) {
    int top_k = js_int(js, "top_k", 10);
    if (top_k > 64) top_k = 64;
    char *t = js_get_str(js, "text", MAX_TXT);
    if (!t) t = calloc(1, 1);
    char norm[MAX_TXT + 1];
    size_t L = strlen(t);
    if (L > MAX_TXT) L = MAX_TXT;
    char tmp[MAX_TXT + 1];
    memcpy(tmp, t, L); tmp[L] = 0;
    tp_normalize(tmp, norm, sizeof norm);
    static TokenList tl;
    tp_tokenize(norm, &tl, 1);
    HashTable *ht = ht_create(2048);
    TrieNode *tr = trie_create();
    for (int i = 0; i < tl.count; i++) { ht_inc(ht, tl.tokens[i]); trie_insert(tr, tl.tokens[i]); }
    g_topn = 0; g_tot = 0;
    ht_foreach(ht, kw_cb, NULL);
    qsort(g_top, (size_t)g_topn, sizeof(TopKV), kw_cmp);
    printf("{\"ok\":true,\"total_tokens\":%d,\"keywords\":[", g_tot);
    for (int i = 0; i < top_k && i < g_topn; i++) {
        if (i) printf(",");
        printf("{\"term\":\"");
        json_print_escaped(g_top[i].keybuf);
        printf("\",\"freq\":%d}", g_top[i].val);
    }
    printf("]}");
    ht_free(ht); trie_free(tr); free(t);
}

static void cmd_analyze(const char *js) {
    int top_k = js_int(js, "top_k", 5);
    if (top_k < 1) top_k = 5;
    if (top_k > 32) top_k = 32;
    char *user = js_get_str(js, "user_text", MAX_TXT);
    if (!user) user = calloc(1, 1);
    const char *arr = js_get_arr(js, "candidates");
    /* parse candidates: [{id,text}...] up to MAX_CAND */
    static char ids[MAX_CAND][64];
    static char *texts[MAX_CAND];
    int nc = 0;
    if (arr) {
        const char *p = arr;
        while (nc < MAX_CAND) {
            const char *o = strchr(p, '{');
            if (!o) break;
            const char *e = strchr(o, '}');
            if (!e) break;
            size_t len = (size_t)(e - o + 1);
            char *obj = malloc(len + 1);
            if (!obj) break;
            memcpy(obj, o, len); obj[len] = 0;
            char *id = js_get_str(obj, "id", 60);
            char *tx = js_get_str(obj, "text", 20000);
            strncpy(ids[nc], id ? id : "", 63); ids[nc][63] = 0;
            texts[nc] = tx ? tx : calloc(1, 1);
            nc++;
            free(id); free(obj);
            p = e + 1;
        }
    }
    /* Build inverted index over candidates + score */
    InvertedIndex ii; ii_init(&ii);
    static TokenList tls[MAX_CAND];
    char norm[MAX_TXT + 1];
    for (int i = 0; i < nc; i++) {
        size_t L = strlen(texts[i]);
        char *cp = malloc(L + 1);
        if (cp) { memcpy(cp, texts[i], L + 1); tp_normalize(cp, norm, sizeof norm); free(cp); }
        else norm[0] = 0;
        tp_tokenize(norm, &tls[i], 1);
        /* copy tokens into 64-wide array for ii */
        static char buf[MAX_CAND][512][64];
        int n = tls[i].count > 512 ? 512 : tls[i].count;
        for (int k = 0; k < n; k++) { strncpy(buf[i][k], tls[i].tokens[k], 63); buf[i][k][63] = 0; }
        /* NOTE: ii_add_doc copies counts; we pass per-doc static buf slice */
        ii_add_doc(&ii, i, buf[i], n);
    }
    /* query tokens */
    char ucp[MAX_TXT + 1];
    size_t UL = strlen(user);
    if (UL > MAX_TXT) UL = MAX_TXT;
    memcpy(ucp, user, UL); ucp[UL] = 0;
    tp_normalize(ucp, norm, sizeof norm);
    TokenList q; tp_tokenize(norm, &q, 1);
    static char qbuf[512][64];
    int nq = q.count > 512 ? 512 : q.count;
    for (int k = 0; k < nq; k++) { strncpy(qbuf[k], q.tokens[k], 63); qbuf[k][63] = 0; }
    ScoredDoc tfidf[256];
    int ngot = ii.nterms ? ii_search(&ii, qbuf, nq, tfidf, 256) : 0;
    double tfidf_by_doc[MAX_CAND] = {0};
    for (int i = 0; i < ngot; i++) tfidf_by_doc[tfidf[i].doc_id] = tfidf[i].score;
    double tfidf_max = 1e-9;
    for (int i = 0; i < nc; i++) if (tfidf_by_doc[i] > tfidf_max) tfidf_max = tfidf_by_doc[i];

    /* Per-candidate lexical signals + weighted rank via heap */
    MinHeap h; heap_init(&h, top_k);
    static double fscore[MAX_CAND], fjac[MAX_CAND], fcos[MAX_CAND], fedit[MAX_CAND], fkmp[MAX_CAND];
    for (int i = 0; i < nc; i++) {
        char cnorm[20001];
        size_t L = strlen(texts[i]);
        char *cp = malloc(L + 1);
        if (cp) { memcpy(cp, texts[i], L + 1); tp_normalize(cp, cnorm, sizeof cnorm); free(cp); }
        else cnorm[0] = 0;
        TokenList c; tp_tokenize(cnorm, &c, 1);
        double j = jaccard_tokens(&q, &c);
        double co = cosine_tf(&q, &c);
        double tr = trigram_similarity(norm, cnorm);
        /* KMP probe: first meaningful query phrase */
        int kmp = 0;
        if (q.count >= 3) {
            char phrase[192] = {0};
            snprintf(phrase, sizeof phrase, "%s %s %s", q.tokens[0], q.tokens[1], q.tokens[2]);
            kmp = kmp_count(cnorm, phrase);
            int r2 = rk_count(cnorm, phrase);
            if (r2 > kmp) kmp = r2;
        }
        /* edit similarity on heads (bounded) */
        char uh[600], ch[600];
        strncpy(uh, norm, 599); uh[599] = 0;
        strncpy(ch, cnorm, 599); ch[599] = 0;
        double es = edit_similarity(uh, ch);
        double sig[4] = { tfidf_by_doc[i] / tfidf_max, j, co, tr };
        double w[4] = { 0.35, 0.25, 0.25, 0.15 };
        double agg = weighted_score(sig, w, 4);
        double final100 = agg * 100.0;
        if (kmp > 0) final100 = final100 > 97 ? 97 : final100 + 2;
        fscore[i] = final100; fjac[i] = j; fcos[i] = co; fedit[i] = es; fkmp[i] = (double)kmp;
        heap_push(&h, i, final100);
    }
    RankItem ri[32];
    int n = heap_drain_desc(&h, ri);
    printf("{\"ok\":true,\"engine\":\"c\",\"results\":[");
    for (int k = 0; k < n; k++) {
        int i = ri[k].id;
        if (k) printf(",");
        printf("{\"id\":\"");
        json_print_escaped(ids[i]);
        printf("\",\"lexical_score\":%.1f,\"jaccard\":%.3f,\"cosine_tf\":%.3f,\"edit_sim\":%.3f,\"kmp_hits\":%d,\"tfidf\":%.3f}",
            fscore[i], fjac[i], fcos[i], fedit[i], (int)fkmp[i], tfidf_by_doc[i]);
    }
    printf("],\"algorithms\":[\"tf-idf\",\"jaccard\",\"cosine-tf\",\"trigram\",\"kmp\",\"rabin-karp\",\"edit-distance\",\"heap-topk\"]}");
    heap_free(&h);
    ii_free(&ii);
    for (int i = 0; i < nc; i++) free(texts[i]);
    free(user);
}

static void cmd_match(const char *js) {
    double thr = 0.55;
    const char *tp = js_val(js, "threshold");
    if (tp) thr = atof(tp);
    char *u = js_get_str(js, "user_text", 20000);
    if (!u) u = calloc(1, 1);
    const char *arr = js_get_arr(js, "sources");
    char unorm[20001];
    char tmp[20001];
    size_t L = strlen(u);
    if (L > 20000) L = 20000;
    memcpy(tmp, u, L); tmp[L] = 0;
    tp_normalize(tmp, unorm, sizeof unorm);
    printf("{\"ok\":true,\"matches\":[");
    int first = 1, idx = 0;
    if (arr) {
        const char *p = arr;
        while (idx < MAX_CAND) {
            const char *o = strchr(p, '{');
            if (!o) break;
            const char *e = strchr(o, '}');
            if (!e) break;
            size_t len = (size_t)(e - o + 1);
            char *obj = malloc(len + 1);
            if (!obj) break;
            memcpy(obj, o, len); obj[len] = 0;
            char *id = js_get_str(obj, "id", 60);
            char *tx = js_get_str(obj, "text", 20000);
            if (tx) {
                char snorm[20001];
                size_t L2 = strlen(tx);
                char *cp = malloc(L2 + 1);
                if (cp) { memcpy(cp, tx, L2 + 1); tp_normalize(cp, snorm, sizeof snorm); free(cp); }
                else snorm[0] = 0;
                double lex = lexical_score(u, tx);
                int kmp = 0;
                if (strlen(unorm) > 12 && strlen(snorm) > 12) {
                    char probe[64];
                    strncpy(probe, unorm, 40); probe[40] = 0;
                    kmp = kmp_count(snorm, probe);
                }
                double es = edit_similarity(unorm, snorm);
                const char *type = "NONE";
                if (kmp > 0 && lex > 0.8) type = "EXACT";
                else if (es > 0.85 || lex > 0.75) type = "NEAR-EXACT";
                else if (lex > thr) type = "LEXICAL";
                if (strcmp(type, "NONE") != 0) {
                    if (!first) printf(",");
                    first = 0;
                    printf("{\"id\":\"");
                    json_print_escaped(id ? id : "");
                    printf("\",\"type\":\"%s\",\"lexical\":%.3f,\"edit_sim\":%.3f,\"kmp_hits\":%d}", type, lex, es, kmp);
                }
                free(tx);
            }
            free(id); free(obj);
            p = e + 1; idx++;
        }
    }
    printf("]}");
    free(u);
}

static void cmd_graph(const char *js) {
    int n = js_int(js, "n", 0);
    if (n < 1) n = 1;
    if (n > G_MAX) n = G_MAX;
    int start = js_int(js, "start", 0);
    int iters = js_int(js, "pagerank_iters", 20);
    if (iters > 100) iters = 100;
    Graph g; g_init(&g, n);
    const char *arr = js_get_arr(js, "edges");
    if (arr) {
        const char *p = arr;
        for (int k = 0; k < 4096; k++) {
            const char *o = strchr(p, '[');
            if (!o) break;
            int a = -1, b = -1;
            if (sscanf(o, "[%d,%d]", &a, &b) == 2) g_add_edge(&g, a, b);
            p = o + 1;
            if (p - arr > 200000) break;
        }
    }
    static int order[G_MAX], dist[G_MAX], comp[G_MAX];
    int nbfs = g_bfs(&g, start, order, dist);
    int ndfs = g_dfs(&g, start, order);
    (void)ndfs;
    int ncomp = g_components(&g, comp);
    static double rank[G_MAX];
    g_pagerank(&g, rank, iters);
    printf("{\"ok\":true,\"bfs_order\":[");
    for (int i = 0; i < nbfs; i++) printf("%s%d", i ? "," : "", order[i]);
    printf("],\"distances\":[");
    for (int i = 0; i < n; i++) printf("%s%d", i ? "," : "", dist[i]);
    printf("],\"components\":[");
    for (int i = 0; i < n; i++) printf("%s%d", i ? "," : "", comp[i]);
    printf("],\"num_components\":%d,\"pagerank\":[", ncomp);
    for (int i = 0; i < n; i++) printf("%s%.4f", i ? "," : "", rank[i]);
    printf("],\"algorithms\":[\"bfs\",\"dfs\",\"connected-components\",\"bfs-shortest-path\",\"pagerank\"]}");
    g_free(&g);
}

int main(void) {
    static char *input = NULL;
    input = malloc(MAX_IN + 1);
    if (!input) { printf("{\"ok\":false,\"error\":\"oom\"}"); return 1; }
    size_t total = 0, r;
    while ((r = fread(input + total, 1, MAX_IN - total, stdin)) > 0) {
        total += r;
        if (total >= MAX_IN) break;
    }
    input[total] = 0;
    char *cmd = js_get_str(input, "cmd", 32);
    if (!cmd) { printf("{\"ok\":false,\"error\":\"missing cmd\"}"); free(input); return 0; }
    if (strcmp(cmd, "fingerprint") == 0) cmd_fingerprint(input);
    else if (strcmp(cmd, "keywords") == 0) cmd_keywords(input);
    else if (strcmp(cmd, "analyze") == 0) cmd_analyze(input);
    else if (strcmp(cmd, "match_passages") == 0) cmd_match(input);
    else if (strcmp(cmd, "graph") == 0) cmd_graph(input);
    else printf("{\"ok\":false,\"error\":\"unknown cmd\"}");
    printf("\n");
    free(cmd); free(input);
    return 0;
}
