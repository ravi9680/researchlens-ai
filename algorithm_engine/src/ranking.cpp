#include "ranking.hpp"
#include <algorithm>
#include <cstring>

namespace rl {

MinHeap::MinHeap(int cap) : cap_(cap > 0 ? cap : 10) {}

MinHeap::~MinHeap() = default;

void MinHeap::push(int id, double score) {
    if ((int)a_.size() < cap_) {
        a_.push_back({id, score});
        int i = (int)a_.size() - 1;
        while (i > 0) {
            int p = (i - 1) / 2;
            if (a_[p].score <= a_[i].score) break;
            std::swap(a_[p], a_[i]); i = p;
        }
    } else if (score > a_[0].score) {
        a_[0] = {id, score};
        int i = 0;
        for (;;) {
            int l = 2 * i + 1, r = l + 1, m = i;
            if (l < (int)a_.size() && a_[l].score < a_[m].score) m = l;
            if (r < (int)a_.size() && a_[r].score < a_[m].score) m = r;
            if (m == i) break;
            std::swap(a_[m], a_[i]); i = m;
        }
    }
}

int MinHeap::drain_desc(RankItem* out) {
    int n = static_cast<int>(a_.size());
    for (int i = 0; i < n; i++) out[i] = a_[i];
    std::sort(out, out + n, [](const RankItem& x, const RankItem& y) { return x.score > y.score; });
    a_.clear();
    return n;
}

void normalize_0_100(double* scores, int n) {
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

double weighted_score(const double* signals, const double* weights, int n) {
    double s = 0, w = 0;
    for (int i = 0; i < n; i++) { s += signals[i] * weights[i]; w += weights[i]; }
    return w > 0 ? s / w : 0;
}

BSTNode::BSTNode(int y, int d) : year(y), doc_id(d), l(nullptr), r(nullptr) {}

void bst_insert(BSTNode** root, int year, int doc_id) {
    if (!*root) { *root = new BSTNode(year, doc_id); return; }
    if (year < (*root)->year) bst_insert(&(*root)->l, year, doc_id);
    else bst_insert(&(*root)->r, year, doc_id);
}

int bst_count_range(BSTNode* root, int y0, int y1) {
    if (!root) return 0;
    int c = (root->year >= y0 && root->year <= y1) ? 1 : 0;
    if (root->year > y0) c += bst_count_range(root->l, y0, y1);
    if (root->year < y1) c += bst_count_range(root->r, y0, y1);
    return c;
}

void bst_free(BSTNode* root) {
    if (!root) return;
    bst_free(root->l); bst_free(root->r); delete root;
}

} // namespace rl
