#ifndef RANKING_H
#define RANKING_H

typedef struct { int id; double score; } RankItem;

/* Min-heap of fixed capacity for top-K (priority queue). */
typedef struct {
    RankItem *a; /* heap array */
    int size, cap;
} MinHeap;

void heap_init(MinHeap *h, int cap);
void heap_free(MinHeap *h);
void heap_push(MinHeap *h, int id, double score); /* keeps only top cap */
/* Drains heap into out[] sorted desc. Returns count. */
int heap_drain_desc(MinHeap *h, RankItem *out);

/* Min-max normalize scores in place to 0..100. */
void normalize_0_100(double *scores, int n);
/* Weighted aggregate of signals with weights summing to ~1. */
double weighted_score(const double *signals, const double *weights, int n);

/* BST index over (year -> doc ids) for sorted metadata lookup + binary search demo */
typedef struct BSTNode { int year; int doc_id; struct BSTNode *l, *r; } BSTNode;
void bst_insert(BSTNode **root, int year, int doc_id);
int bst_count_range(BSTNode *root, int y0, int y1);
void bst_free(BSTNode *root);

#endif
