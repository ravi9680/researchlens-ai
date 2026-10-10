#ifndef STRING_MATCHING_H
#define STRING_MATCHING_H

/* KMP: returns number of occurrences of pattern in text (overlapping). */
int kmp_count(const char *text, const char *pattern);
/* Rabin-Karp (rolling hash, base 256 mod 1e9+7): occurrence count. */
int rk_count(const char *text, const char *pattern);
/* Edit distance (Levenshtein, DP, O(m*n) time, O(min) space). */
int edit_distance(const char *a, const char *b);
/* Normalized 0..1 similarity from edit distance. */
double edit_similarity(const char *a, const char *b);
/* LCS length (DP, O(m*n) time). */
int lcs_length(const char *a, const char *b);

#endif
