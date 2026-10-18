#include "graph.hpp"
#include <algorithm>

namespace rl {

Graph::Graph(int n) {
    n_ = n > 2048 ? 2048 : n;
    adj_ = new GEdge*[n_]();
    for (int i = 0; i < n_; i++) adj_[i] = nullptr;
    qhead_ = qtail_ = 0;
}

Graph::~Graph() {
    for (int i = 0; i < n_; i++) {
        GEdge* e = adj_[i];
        while (e) { GEdge* nx = e->next; delete e; e = nx; }
        adj_[i] = nullptr;
    }
    delete[] adj_;
}

void Graph::add_edge(int from, int to) {
    if (from < 0 || to < 0 || from >= n_ || to >= n_) return;
    GEdge* e = new GEdge{ to, adj_[from] };
    adj_[from] = e;
}

int Graph::bfs(int start, int* order, int* dist) {
    if (start < 0 || start >= n_) return 0;
    for (int i = 0; i < n_; i++) dist[i] = -1;
    qhead_ = qtail_ = 0;
    q_[qtail_] = start; qtail_ = (qtail_ + 1) % 2048; dist[start] = 0;
    int count = 0;
    while (qhead_ != qtail_) {
        int u = q_[qhead_]; qhead_ = (qhead_ + 1) % 2048;
        order[count++] = u;
        for (GEdge* e = adj_[u]; e; e = e->next)
            if (dist[e->to] == -1) { dist[e->to] = dist[u] + 1; q_[qtail_] = e->to; qtail_ = (qtail_ + 1) % 2048; }
    }
    return count;
}

int Graph::dfs(int start, int* order) const {
    if (start < 0 || start >= n_) return 0;
    std::vector<int> vis(n_, 0);
    std::vector<int> stack(n_);
    int top = 0, count = 0;
    stack[top++] = start; vis[start] = 1;
    while (top > 0) {
        int u = stack[--top];
        order[count++] = u;
        for (GEdge* e = adj_[u]; e; e = e->next)
            if (!vis[e->to]) { vis[e->to] = 1; stack[top++] = e->to; }
    }
    return count;
}

int Graph::components(int* comp) {
    for (int i = 0; i < n_; i++) comp[i] = -1;
    int nc = 0;
    std::vector<int> order(n_), dist(n_);
    for (int i = 0; i < n_; i++) {
        if (comp[i] != -1) continue;
        int c = bfs(i, order.data(), dist.data());
        for (int k = 0; k < c; k++) comp[order[k]] = nc;
        nc++;
    }
    return nc;
}

int Graph::shortest_path(int src, int dst) {
    std::vector<int> order(n_), dist(n_);
    bfs(src, order.data(), dist.data());
    return (dst >= 0 && dst < n_) ? dist[dst] : -1;
}

void Graph::pagerank(double* rank, int iters) const {
    const double d = 0.85;
    std::vector<int> outdeg(n_, 0);
    for (int i = 0; i < n_; i++) {
        int c = 0;
        for (GEdge* e = adj_[i]; e; e = e->next) c++;
        outdeg[i] = c;
    }
    for (int i = 0; i < n_; i++) rank[i] = 1.0 / (n_ ? n_ : 1);
    std::vector<double> nr(n_);
    for (int it = 0; it < iters; it++) {
        for (int i = 0; i < n_; i++) nr[i] = (1.0 - d) / (n_ ? n_ : 1);
        for (int i = 0; i < n_; i++) {
            if (!outdeg[i]) {
                for (int j = 0; j < n_; j++) nr[j] += d * rank[i] / n_;
            } else {
                for (GEdge* e = adj_[i]; e; e = e->next)
                    nr[e->to] += d * rank[i] / outdeg[i];
            }
        }
        for (int i = 0; i < n_; i++) rank[i] = nr[i];
    }
}

} // namespace rl
