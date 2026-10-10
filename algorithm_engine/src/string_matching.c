#include "string_matching.h"
#include <string.h>
#include <stdlib.h>

/* KMP prefix function + overlapping search. O(n+m). */
int kmp_count(const char *text, const char *pattern) {
    int n = (int)strlen(text), m = (int)strlen(pattern);
    if (!m || m > n) return 0;
    int *pi = malloc(sizeof(int) * (size_t)m);
    if (!pi) return 0;
    pi[0] = 0;
    for (int i = 1, j = 0; i < m; i++) {
        while (j > 0 && pattern[i] != pattern[j]) j = pi[j - 1];
        if (pattern[i] == pattern[j]) j++;
        pi[i] = j;
    }
    int count = 0;
    for (int i = 0, j = 0; i < n; i++) {
        while (j > 0 && text[i] != pattern[j]) j = pi[j - 1];
        if (text[i] == pattern[j]) j++;
        if (j == m) { count++; j = pi[j - 1]; }
    }
    free(pi);
    return count;
}

/* Rabin-Karp with mod arithmetic. O(n+m) average. */
int rk_count(const char *text, const char *pattern) {
    const long MOD = 1000000007L, BASE = 256L;
    int n = (int)strlen(text), m = (int)strlen(pattern);
    if (!m || m > n) return 0;
    long ph = 0, th = 0, pow = 1;
    for (int i = 0; i < m; i++) {
        ph = (ph * BASE + (unsigned char)pattern[i]) % MOD;
        th = (th * BASE + (unsigned char)text[i]) % MOD;
        if (i) pow = (pow * BASE) % MOD;
    }
    int count = 0;
    for (int i = 0; i <= n - m; i++) {
        if (ph == th && strncmp(text + i, pattern, (size_t)m) == 0) count++;
        if (i < n - m) {
            th = (th - (unsigned char)text[i] * pow % MOD + MOD) % MOD;
            th = (th * BASE + (unsigned char)text[i + m]) % MOD;
        }
    }
    return count;
}

int edit_distance(const char *a, const char *b) {
    int m = (int)strlen(a), n = (int)strlen(b);
    if (!m) return n;
    if (!n) return m;
    /* keep smaller string on columns */
    if (n > m) { const char *t = a; a = b; b = t; int ti = m; m = n; n = ti; }
    int *prev = malloc(sizeof(int) * (size_t)(n + 1));
    int *cur = malloc(sizeof(int) * (size_t)(n + 1));
    if (!prev || !cur) { free(prev); free(cur); return m + n; }
    for (int j = 0; j <= n; j++) prev[j] = j;
    for (int i = 1; i <= m; i++) {
        cur[0] = i;
        for (int j = 1; j <= n; j++)
            cur[j] = a[i-1] == b[j-1] ? prev[j-1] :
                1 + (prev[j] < cur[j-1] ? (prev[j] < prev[j-1] ? prev[j] : prev[j-1])
                                        : (cur[j-1] < prev[j-1] ? cur[j-1] : prev[j-1]));
        int *t = prev; prev = cur; cur = t;
    }
    int d = prev[n];
    free(prev); free(cur);
    return d;
}

double edit_similarity(const char *a, const char *b) {
    int m = (int)strlen(a), n = (int)strlen(b);
    int mx = m > n ? m : n;
    if (!mx) return 1.0;
    return 1.0 - (double)edit_distance(a, b) / mx;
}

int lcs_length(const char *a, const char *b) {
    int m = (int)strlen(a), n = (int)strlen(b);
    if (!m || !n) return 0;
    if (n > m) { const char *t = a; a = b; b = t; int ti = m; m = n; n = ti; }
    int *prev = calloc((size_t)n + 1, sizeof(int));
    int *cur = calloc((size_t)n + 1, sizeof(int));
    if (!prev || !cur) { free(prev); free(cur); return 0; }
    for (int i = 1; i <= m; i++) {
        for (int j = 1; j <= n; j++)
            cur[j] = a[i-1] == b[j-1] ? prev[j-1] + 1 : (prev[j] > cur[j-1] ? prev[j] : cur[j-1]);
        int *t = prev; prev = cur; cur = t;
    }
    int r = prev[n];
    free(prev); free(cur);
    return r;
}
