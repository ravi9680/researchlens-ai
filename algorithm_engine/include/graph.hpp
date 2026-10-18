#ifndef GRAPH_HPP
#define GRAPH_HPP

#include <vector>

namespace rl {

struct GEdge {
    int to;
    GEdge* next;
};

class Graph {
public:
    Graph(int n);
    ~Graph();
    void add_edge(int from, int to);
    int bfs(int start, int* order, int* dist);
    int dfs(int start, int* order) const;
    int components(int* comp);
    int shortest_path(int src, int dst);
    void pagerank(double* rank, int iters) const;

    int n() const { return n_; }

private:
    int n_;
    GEdge** adj_;
    int q_[2048];
    int qhead_, qtail_;
};

} // namespace rl

#endif
