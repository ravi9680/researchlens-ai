#include "similarity.hpp"
#include <cmath>
#include <algorithm>
#include <unordered_map>
#include <unordered_set>

namespace rl {

/* ------------------------------------------------------------------
 * The three similarity measures below used to deduplicate by scanning
 * every earlier element — O(n^2) string comparisons. With the engine's
 * token limit (8192) and a 20 000-character document that is roughly
 * 3.4e7 comparisons *per candidate*, and 8e9 for a 40-candidate
 * analysis. On a shared 0.5-CPU container that blew the time budget,
 * the lexical stage was skipped, and on Render the killed child wrote
 * EPIPE back to a stdin pipe with no error listener, which took the
 * whole server down mid-analysis.
 *
 * The hash-set versions below are O(n) expected and produce exactly the
 * same numbers: the set is only used to decide which occurrences are
 * counted once, never to change what is counted.
 * ------------------------------------------------------------------ */

double Similarity::jaccard_tokens(TokenList* a, TokenList* b) {
    if (a->tokens.empty() || b->tokens.empty()) return 0.0;

    // Distinct tokens of b, for O(1) membership tests.
    std::unordered_set<std::string> setB;
    setB.reserve(b->tokens.size() * 2);
    for (const auto& tb : b->tokens) setB.insert(tb);

    int inter = 0, ua = 0;
    std::unordered_set<std::string> seenA;
    seenA.reserve(a->tokens.size() * 2);
    for (const auto& ta : a->tokens) {
        if (!seenA.insert(ta).second) continue;   // already counted
        ua++;
        if (setB.count(ta)) inter++;
    }

    const int ub = (int)setB.size();
    const int uni = ua + ub - inter;
    return uni ? (double)inter / uni : 0.0;
}

double Similarity::cosine_tf(TokenList* a, TokenList* b) {
    if (a->tokens.empty() || b->tokens.empty()) return 0.0;

    // Term-frequency maps — one pass each.
    std::unordered_map<std::string, double> fa, fb;
    fa.reserve(a->tokens.size() * 2);
    fb.reserve(b->tokens.size() * 2);
    for (const auto& t : a->tokens) fa[t] += 1.0;
    for (const auto& t : b->tokens) fb[t] += 1.0;

    double dot = 0, na = 0, nb = 0;
    for (const auto& kv : fa) {
        const double x = kv.second;
        auto it = fb.find(kv.first);
        const double y = (it == fb.end()) ? 0.0 : it->second;
        dot += x * y;
        na += x * x;
    }
    for (const auto& kv : fb) nb += kv.second * kv.second;

    if (!na || !nb) return 0.0;
    return dot / (std::sqrt(na) * std::sqrt(nb));
}

int Similarity::edit_distance(const std::string& a, const std::string& b) {
    int m = static_cast<int>(a.size()), n = static_cast<int>(b.size());
    if (!m) return n;
    if (!n) return m;
    if (n > m) { return edit_distance(b, a); }
    std::vector<int> prev(n + 1), cur(n + 1);
    for (int j = 0; j <= n; j++) prev[j] = j;
    for (int i = 1; i <= m; i++) {
        cur[0] = i;
        for (int j = 1; j <= n; j++)
            cur[j] = (a[i-1] == b[j-1]) ? prev[j-1] :
                1 + std::min(std::min(prev[j], cur[j-1]), prev[j-1]);
        prev.swap(cur);
    }
    return prev[n];
}

double Similarity::edit_similarity(const std::string& a, const std::string& b) {
    int m = static_cast<int>(a.size()), n = static_cast<int>(b.size());
    int mx = m > n ? m : n;
    if (!mx) return 1.0;
    return 1.0 - (double)edit_distance(a, b) / mx;
}

int Similarity::lcs_length(const std::string& a, const std::string& b) {
    int m = static_cast<int>(a.size()), n = static_cast<int>(b.size());
    if (!m || !n) return 0;
    if (n > m) { return lcs_length(b, a); }
    std::vector<int> prev(n + 1, 0), cur(n + 1, 0);
    for (int i = 1; i <= m; i++) {
        for (int j = 1; j <= n; j++)
            cur[j] = (a[i-1] == b[j-1]) ? prev[j-1] + 1 : std::max(prev[j], cur[j-1]);
        prev.swap(cur);
    }
    return prev[n];
}

double Similarity::trigram_similarity(const std::string& a, const std::string& b) {
    int la = static_cast<int>(a.size()), lb = static_cast<int>(b.size());
    if (la < 3 || lb < 3) return 0.0;
    int na = la - 2, nb = lb - 2;

    /* Trigram Jaccard.
     * The previous implementation deduplicated by comparing every window
     * with every earlier window - O(n^2) substring comparisons, and with a
     * 20 000-character document that is ~2e8 comparisons *per candidate*.
     * Hashing the 3-character windows makes it O(n) expected time and
     * produces exactly the same score. */
    std::unordered_set<std::string> setB;
    setB.reserve((size_t)nb * 2);
    for (int j = 0; j < nb; j++) setB.insert(b.substr(j, 3));

    int inter = 0, ua = 0;
    std::unordered_set<std::string> seenA;
    seenA.reserve((size_t)na * 2);
    for (int i = 0; i < na; i++) {
        const std::string tri = a.substr(i, 3);
        if (!seenA.insert(tri).second) continue;   // already counted
        ua++;
        if (setB.count(tri)) inter++;
    }

    const int ub = (int)setB.size();
    const int uni = ua + ub - inter;
    return uni ? (double)inter / uni : 0.0;
}

double Similarity::lexical_score(const std::string& a, const std::string& b) {
    std::string na, nb;
    TextProcessor::normalize(a, na);
    TextProcessor::normalize(b, nb);
    TokenList A, B;
    TextProcessor::tokenize(na, A, 1);
    TextProcessor::tokenize(nb, B, 1);
    double j = jaccard_tokens(&A, &B);
    double c = cosine_tf(&A, &B);
    double t = trigram_similarity(na, nb);
    return 0.4 * c + 0.3 * j + 0.3 * t;
}

} // namespace rl
