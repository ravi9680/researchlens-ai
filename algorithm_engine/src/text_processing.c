#include "text_processing.h"
#include <string.h>
#include <ctype.h>
#include <stdlib.h>

static const char *STOPWORDS[] = {
    "the","a","an","and","or","of","to","in","on","for","with","using","used","by",
    "from","as","is","are","was","were","be","been","that","this","these","those",
    "it","its","at","into","over","under","between","through","our","we","they",
    "their","paper","study","research","method","model","based","via","new","novel",
    "proposed","can","has","have","had","will","would","should","could","may","might",
    "about","also","such","than","then","them","there","which","while","within", NULL
};

int tp_is_stopword(const char *tok) {
    for (int i = 0; STOPWORDS[i]; i++)
        if (strcmp(tok, STOPWORDS[i]) == 0) return 1;
    return 0;
}

void tp_normalize(const char *in, char *out, size_t out_sz) {
    size_t j = 0;
    for (size_t i = 0; in[i] && j + 1 < out_sz; i++) {
        unsigned char c = (unsigned char)in[i];
        if (isalnum(c) || c == ' ') out[j++] = (char)tolower(c);
        else if (c == '-' || c == '_') out[j++] = ' ';
        else out[j++] = ' ';
    }
    out[j] = '\0';
}

void tp_tokenize(const char *normalized, TokenList *out, int filter_stop) {
    out->count = 0;
    const char *p = normalized;
    char tok[TP_MAX_TOKEN_LEN];
    while (*p && out->count < TP_MAX_TOKENS) {
        while (*p == ' ') p++;
        if (!*p) break;
        size_t k = 0;
        while (*p && *p != ' ' && k + 1 < sizeof(tok)) tok[k++] = *p++;
        tok[k] = '\0';
        if (k < 2) continue;
        if (filter_stop && tp_is_stopword(tok)) continue;
        strncpy(out->tokens[out->count], tok, TP_MAX_TOKEN_LEN - 1);
        out->tokens[out->count][TP_MAX_TOKEN_LEN - 1] = '\0';
        out->count++;
    }
}

unsigned long long tp_fnv1a(const char *s) {
    unsigned long long h = 1469598103934665603ULL;
    for (; *s; s++) { h ^= (unsigned char)*s; h *= 1099511628211ULL; }
    return h;
}

unsigned long long tp_doc_fingerprint(const char *text) {
    /* shingle-ish: hash of normalized prefix samples (fast doc identity check) */
    size_t n = strlen(text);
    unsigned long long h = 1469598103934665603ULL;
    size_t step = n > 1200 ? n / 400 : 3;
    if (!step) step = 1;
    for (size_t i = 0; i < n; i += step) {
        h ^= (unsigned char)text[i];
        h *= 1099511628211ULL;
    }
    h ^= (unsigned long long)n * 0x9e3779b97f4a7c15ULL;
    h *= 1099511628211ULL;
    return h;
}
