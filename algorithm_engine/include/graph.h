#ifndef GRAPH_H
#define GRAPH_H

#define G_MAX 2048

typedef struct GEdge { int to; struct GEdge *next; } GEdge; /* adjacency list */

typedef struct {
    GEdge *adj[G_MAX];
    int n;
    /* circular queue for BFS */
    int q[G_MAX];
    int qhead, qtail;
} Graph;

void g_init(Graph *g, int n);
void g_free(Graph *g);
void g_add_edge(Graph *g, int from, int to);
/* BFS order from start; returns count, fills order[]. */
int g_bfs(Graph *g, int start, int *order, int *dist);
/* DFS (iterative, explicit stack). Returns count. */
int g_dfs(Graph *g, int start, int *order);
/* Connected components. comp[i] = component id. Returns #components. */
int g_components(Graph *g, int *comp);
/* BFS shortest path length; -1 if unreachable. */
int g_shortest_path(Graph *g, int src, int dst);
/* PageRank-style power iteration (damping 0.85). fills rank[]. */
void g_pagerank(Graph *g, double *rank, int iters);

#endif
