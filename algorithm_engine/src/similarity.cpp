#include "similarity.hpp"
#include <cmath>
#include <algorithm>

namespace rl {

double Similarity::jaccard_tokens(TokenList* a, TokenList* b) {
    if (a->tokens.empty() || b->tokens.empty()) return 0.0;
    int inter = 0;
    for (size_t i = 0; i < a->tokens.size(); i++) {
        // Skip if this token was already seen earlier (dedup)
        bool already = false;
        for (size_t k = 0; k < i; k++)
            if (a->tokens[k] == a->tokens[i]) { already = true; break; }
        if (already) continue;
        for (const auto& tb : b->tokens)
            if (a->tokens[i] == tb) { inter++; break; }
    }
    int ua = 0, ub = 0;
    for (size_t i = 0; i < a->tokens.size(); i++) {
        bool dup = false;
        for (size_t k = 0; k < i; k++) if (a->tokens[k] == a->tokens[i]) { dup = true; break; }
        if (!dup) ua++;
    }
    for (size_t j = 0; j < b->tokens.size(); j++) {
        bool dup = false;
        for (size_t k = 0; k < j; k++) if (b->tokens[k] == b->tokens[j]) { dup = true; break; }
        if (!dup) ub++;
    }
    int uni = ua + ub - inter;
    return uni ? (double)inter / uni : 0.0;
}

double Similarity::cosine_tf(TokenList* a, TokenList* b) {
    if (a->tokens.empty() || b->tokens.empty()) return 0.0;
    double dot = 0, na = 0, nb = 0;
    for (size_t i = 0; i < a->tokens.size(); i++) {
        bool seen = false;
        for (size_t k = 0; k < i; k++) if (a->tokens[k] == a->tokens[i]) { seen = true; break; }
        if (seen) continue;
        double fa = 0, fb = 0;
        for (const auto& t : a->tokens) if (t == a->tokens[i]) fa++;
        for (const auto& t : b->tokens) if (t == a->tokens[i]) fb++;
        dot += fa * fb; na += fa * fa;
    }
    for (size_t j = 0; j < b->tokens.size(); j++) {
        bool seen = false;
        for (size_t k = 0; k < j; k++) if (b->tokens[k] == b->tokens[j]) { seen = true; break; }
        if (seen) continue;
        double fb = 0;
        for (const auto& t : b->tokens) if (t == b->tokens[j]) fb++;
        nb += fb * fb;
    }
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
    int inter = 0;
    for (int i = 0; i < na; i++) {
        bool dup = false;
        for (int k = 0; k < i; k++)
            if (a.compare(i, 3, a, k, 3) == 0) { dup = true; break; }
        if (dup) continue;
        for (int j = 0; j < nb; j++)
            if (a.compare(i, 3, b, j, 3) == 0) { inter++; break; }
    }
    int ua = 0, ub = 0;
    for (int i = 0; i < na; i++) {
        bool dup = false;
        for (int k = 0; k < i; k++)
            if (a.compare(i, 3, a, k, 3) == 0) { dup = true; break; }
        if (!dup) ua++;
    }
    for (int j = 0; j < nb; j++) {
        bool dup = false;
        for (int k = 0; k < j; k++)
            if (b.compare(j, 3, b, k, 3) == 0) { dup = true; break; }
        if (!dup) ub++;
    }
    int uni = ua + ub - inter;
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
