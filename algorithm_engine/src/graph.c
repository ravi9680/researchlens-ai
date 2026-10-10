#include "graph.h"
#include <stdlib.h>

void g_init(Graph *g, int n) {
    if (n > G_MAX) n = G_MAX;
    g->n = n;
    for (int i = 0; i < n; i++) g->adj[i] = NULL;
    g->qhead = g->qtail = 0;
}

void g_free(Graph *g) {
    for (int i = 0; i < g->n; i++) {
        GEdge *e = g->adj[i];
        while (e) { GEdge *nx = e->next; free(e); e = nx; }
        g->adj[i] = NULL;
    }
}

void g_add_edge(Graph *g, int from, int to) {
    if (from < 0 || to < 0 || from >= g->n || to >= g->n) return;
    GEdge *e = malloc(sizeof *e);
    if (!e) return;
    e->to = to; e->next = g->adj[from]; g->adj[from] = e;
}

/* circular queue helpers */
static void q_reset(Graph *g) { g->qhead = g->qtail = 0; }
static int q_empty(Graph *g) { return g->qhead == g->qtail; }
static void q_push(Graph *g, int v) { g->q[g->qtail] = v; g->qtail = (g->qtail + 1) % G_MAX; }
static int q_pop(Graph *g) { int v = g->q[g->qhead]; g->qhead = (g->qhead + 1) % G_MAX; return v; }

int g_bfs(Graph *g, int start, int *order, int *dist) {
    if (start < 0 || start >= g->n) return 0;
    for (int i = 0; i < g->n; i++) dist[i] = -1;
    q_reset(g);
    q_push(g, start); dist[start] = 0;
    int count = 0;
    while (!q_empty(g)) {
        int u = q_pop(g);
        order[count++] = u;
        for (GEdge *e = g->adj[u]; e; e = e->next) {
            if (dist[e->to] == -1) { dist[e->to] = dist[u] + 1; q_push(g, e->to); }
        }
    }
    return count;
}

int g_dfs(Graph *g, int start, int *order) {
    if (start < 0 || start >= g->n) return 0;
    int *vis = calloc((size_t)g->n, sizeof(int));
    int *stack = malloc(sizeof(int) * (size_t)g->n);
    if (!vis || !stack) { free(vis); free(stack); return 0; }
    int top = 0, count = 0;
    stack[top++] = start; vis[start] = 1;
    while (top > 0) {
        int u = stack[--top];
        order[count++] = u;
        for (GEdge *e = g->adj[u]; e; e = e->next)
            if (!vis[e->to]) { vis[e->to] = 1; stack[top++] = e->to; }
    }
    free(vis); free(stack);
    return count;
}

int g_components(Graph *g, int *comp) {
    for (int i = 0; i < g->n; i++) comp[i] = -1;
    int nc = 0;
    int *order = malloc(sizeof(int) * (size_t)g->n);
    int *dist = malloc(sizeof(int) * (size_t)g->n);
    if (!order || !dist) { free(order); free(dist); return 0; }
    for (int i = 0; i < g->n; i++) {
        if (comp[i] != -1) continue;
        int c = g_bfs(g, i, order, dist);
        for (int k = 0; k < c; k++) comp[order[k]] = nc;
        nc++;
    }
    free(order); free(dist);
    return nc;
}

int g_shortest_path(Graph *g, int src, int dst) {
    int *order = malloc(sizeof(int) * (size_t)g->n);
    int *dist = malloc(sizeof(int) * (size_t)g->n);
    if (!order || !dist) { free(order); free(dist); return -1; }
    g_bfs(g, src, order, dist);
    int d = (dst >= 0 && dst < g->n) ? dist[dst] : -1;
    free(order); free(dist);
    return d;
}

void g_pagerank(Graph *g, double *rank, int iters) {
    const double d = 0.85;
    int *outdeg = calloc((size_t)g->n, sizeof(int));
    if (!outdeg) return;
    for (int i = 0; i < g->n; i++) {
        int c = 0;
        for (GEdge *e = g->adj[i]; e; e = e->next) c++;
        outdeg[i] = c;
    }
    for (int i = 0; i < g->n; i++) rank[i] = 1.0 / (g->n ? g->n : 1);
    double *nr = malloc(sizeof(double) * (size_t)g->n);
    if (!nr) { free(outdeg); return; }
    for (int it = 0; it < iters; it++) {
        for (int i = 0; i < g->n; i++) nr[i] = (1.0 - d) / (g->n ? g->n : 1);
        for (int i = 0; i < g->n; i++) {
            if (!outdeg[i]) {
                for (int j = 0; j < g->n; j++) nr[j] += d * rank[i] / g->n;
            } else {
                for (GEdge *e = g->adj[i]; e; e = e->next)
                    nr[e->to] += d * rank[i] / outdeg[i];
            }
        }
        for (int i = 0; i < g->n; i++) rank[i] = nr[i];
    }
    free(nr); free(outdeg);
}
