#include "similarity.h"
#include "text_processing.h"
#include <string.h>
#include <math.h>

double jaccard_tokens(TokenList *a, TokenList *b) {
    if (!a->count || !b->count) return 0.0;
    int inter = 0;
    for (int i = 0; i < a->count; i++) {
        int dup = 0;
        for (int k = 0; k < i; k++)
            if (strcmp(a->tokens[i], a->tokens[k]) == 0) { dup = 1; break; }
        if (dup) continue;
        for (int j = 0; j < b->count; j++)
            if (strcmp(a->tokens[i], b->tokens[j]) == 0) { inter++; break; }
    }
    /* union of unique */
    int ua = 0, ub = 0;
    for (int i = 0; i < a->count; i++) {
        int dup = 0;
        for (int k = 0; k < i; k++)
            if (strcmp(a->tokens[i], a->tokens[k]) == 0) { dup = 1; break; }
        if (!dup) ua++;
    }
    for (int j = 0; j < b->count; j++) {
        int dup = 0;
        for (int k = 0; k < j; k++)
            if (strcmp(b->tokens[j], b->tokens[k]) == 0) { dup = 1; break; }
        if (!dup) ub++;
    }
    int uni = ua + ub - inter;
    return uni ? (double)inter / uni : 0.0;
}

static int tf_count(TokenList *t, const char *tok) {
    int c = 0;
    for (int i = 0; i < t->count; i++)
        if (strcmp(t->tokens[i], tok) == 0) c++;
    return c;
}

double cosine_tf(TokenList *a, TokenList *b) {
    if (!a->count || !b->count) return 0.0;
    double dot = 0, na = 0, nb = 0;
    for (int i = 0; i < a->count; i++) {
        int seen = 0;
        for (int k = 0; k < i; k++)
            if (strcmp(a->tokens[i], a->tokens[k]) == 0) { seen = 1; break; }
        if (seen) continue;
        double fa = (double)tf_count(a, a->tokens[i]);
        double fb = (double)tf_count(b, a->tokens[i]);
        dot += fa * fb; na += fa * fa;
    }
    for (int j = 0; j < b->count; j++) {
        int seen = 0;
        for (int k = 0; k < j; k++)
            if (strcmp(b->tokens[j], b->tokens[k]) == 0) { seen = 1; break; }
        if (seen) continue;
        double fb = (double)tf_count(b, b->tokens[j]);
        nb += fb * fb;
    }
    if (!na || !nb) return 0.0;
    return dot / (sqrt(na) * sqrt(nb));
}

double trigram_similarity(const char *a, const char *b) {
    int la = (int)strlen(a), lb = (int)strlen(b);
    if (la < 3 || lb < 3) return 0.0;
    /* sample-based to bound memory: compare trigram sets via hashing */
    int na = la - 2, nb = lb - 2;
    int inter = 0;
    /* for each trigram in a (dedup by scan), check membership in b */
    for (int i = 0; i < na; i++) {
        int dup = 0;
        for (int k = 0; k < i; k++)
            if (strncmp(a + i, a + k, 3) == 0) { dup = 1; break; }
        if (dup) continue;
        for (int j = 0; j < nb; j++)
            if (strncmp(a + i, b + j, 3) == 0) { inter++; break; }
    }
    int ua = 0, ub = 0;
    for (int i = 0; i < na; i++) {
        int dup = 0;
        for (int k = 0; k < i; k++)
            if (strncmp(a + i, a + k, 3) == 0) { dup = 1; break; }
        if (!dup) ua++;
    }
    for (int j = 0; j < nb; j++) {
        int dup = 0;
        for (int k = 0; k < j; k++)
            if (strncmp(b + j, b + k, 3) == 0) { dup = 1; break; }
        if (!dup) ub++;
    }
    int uni = ua + ub - inter;
    return uni ? (double)inter / uni : 0.0;
}

double lexical_score(const char *a, const char *b) {
    char na[8192], nb[8192];
    /* bounded normalize */
    size_t la = strlen(a), lb = strlen(b);
    if (la > 7000) la = 7000;
    if (lb > 7000) lb = 7000;
    char ta[7168], tb[7168];
    memcpy(ta, a, la); ta[la] = 0;
    memcpy(tb, b, lb); tb[lb] = 0;
    tp_normalize(ta, na, sizeof na);
    tp_normalize(tb, nb, sizeof nb);
    TokenList A, B;
    tp_tokenize(na, &A, 1);
    tp_tokenize(nb, &B, 1);
    double j = jaccard_tokens(&A, &B);
    double c = cosine_tf(&A, &B);
    double t = trigram_similarity(na, nb);
    return 0.4 * c + 0.3 * j + 0.3 * t;
}
