#ifndef RANKING_HPP
#define RANKING_HPP

#include <vector>

namespace rl {

struct RankItem {
    int id;
    double score;
};

class MinHeap {
public:
    MinHeap(int cap);
    ~MinHeap();
    void push(int id, double score);
    int drain_desc(RankItem* out);

private:
    std::vector<RankItem> a_;
    int cap_;
};

void normalize_0_100(double* scores, int n);
double weighted_score(const double* signals, const double* weights, int n);

struct BSTNode {
    int year;
    int doc_id;
    BSTNode* l;
    BSTNode* r;

    BSTNode(int y, int d);
};

void bst_insert(BSTNode** root, int year, int doc_id);
int bst_count_range(BSTNode* root, int y0, int y1);
void bst_free(BSTNode* root);

} // namespace rl

#endif
