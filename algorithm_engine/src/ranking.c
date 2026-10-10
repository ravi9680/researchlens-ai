#include "ranking.h"
#include <stdlib.h>

void heap_init(MinHeap *h, int cap) {
    h->cap = cap > 0 ? cap : 10;
    h->size = 0;
    h->a = malloc(sizeof(RankItem) * (size_t)h->cap);
}

void heap_free(MinHeap *h) { free(h->a); h->a = NULL; h->size = h->cap = 0; }

static void swap(RankItem *a, RankItem *b) { RankItem t = *a; *a = *b; *b = t; }

void heap_push(MinHeap *h, int id, double score) {
    if (!h->a) return;
    if (h->size < h->cap) {
        int i = h->size++;
        h->a[i].id = id; h->a[i].score = score;
        while (i > 0) {
            int p = (i - 1) / 2;
            if (h->a[p].score <= h->a[i].score) break;
            swap(&h->a[p], &h->a[i]); i = p;
        }
    } else if (score > h->a[0].score) {
        h->a[0].id = id; h->a[0].score = score;
        int i = 0;
        for (;;) {
            int l = 2 * i + 1, r = l + 1, m = i;
            if (l < h->size && h->a[l].score < h->a[m].score) m = l;
            if (r < h->size && h->a[r].score < h->a[m].score) m = r;
            if (m == i) break;
            swap(&h->a[m], &h->a[i]); i = m;
        }
    }
}

static int cmp_desc(const void *a, const void *b) {
    double d = ((const RankItem *)b)->score - ((const RankItem *)a)->score;
    return d > 0 ? 1 : d < 0 ? -1 : 0;
}

int heap_drain_desc(MinHeap *h, RankItem *out) {
    int n = h->size;
    for (int i = 0; i < n; i++) out[i] = h->a[i];
    qsort(out, (size_t)n, sizeof(RankItem), cmp_desc);
    h->size = 0;
    return n;
}

void normalize_0_100(double *scores, int n) {
    if (n <= 0) return;
    double mn = scores[0], mx = scores[0];
    for (int i = 1; i < n; i++) {
        if (scores[i] < mn) mn = scores[i];
        if (scores[i] > mx) mx = scores[i];
    }
    double range = mx - mn;
    for (int i = 0; i < n; i++)
        scores[i] = range < 1e-9 ? 100.0 : (scores[i] - mn) / range * 100.0;
}

double weighted_score(const double *signals, const double *weights, int n) {
    double s = 0, w = 0;
    for (int i = 0; i < n; i++) { s += signals[i] * weights[i]; w += weights[i]; }
    return w > 0 ? s / w : 0;
}

void bst_insert(BSTNode **root, int year, int doc_id) {
    if (!*root) {
        BSTNode *n = malloc(sizeof *n);
        if (!n) return;
        n->year = year; n->doc_id = doc_id; n->l = n->r = NULL;
        *root = n; return;
    }
    if (year < (*root)->year) bst_insert(&(*root)->l, year, doc_id);
    else bst_insert(&(*root)->r, year, doc_id);
}

int bst_count_range(BSTNode *root, int y0, int y1) {
    if (!root) return 0;
    int c = (root->year >= y0 && root->year <= y1) ? 1 : 0;
    if (root->year > y0) c += bst_count_range(root->l, y0, y1);
    if (root->year < y1) c += bst_count_range(root->r, y0, y1);
    return c;
}

void bst_free(BSTNode *root) {
    if (!root) return;
    bst_free(root->l); bst_free(root->r); free(root);
}
