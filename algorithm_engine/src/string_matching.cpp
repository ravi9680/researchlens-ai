#include "string_matching.hpp"
#include <cstring>
#include <cstdlib>
#include <vector>
#include <algorithm>

namespace rl {

int StringMatcher::kmp_count(const std::string& text, const std::string& pattern) {
    int n = static_cast<int>(text.size()), m = static_cast<int>(pattern.size());
    if (!m || m > n) return 0;
    std::vector<int> pi(m, 0);
    for (int i = 1, j = 0; i < m; i++) {
        while (j > 0 && pattern[i] != pattern[j]) j = pi[j - 1];
        if (pattern[i] == pattern[j]) j++;
        pi[i] = j;
    }
    int count = 0;
    for (int i = 0, j = 0; i < n; i++) {
        while (j > 0 && text[i] != pattern[j]) j = pi[j - 1];
        if (text[i] == pattern[j]) j++;
        if (j == m) { count++; j = pi[j - 1]; }
    }
    return count;
}

int StringMatcher::rk_count(const std::string& text, const std::string& pattern) {
    const long MOD = 1000000007L, BASE = 256L;
    int n = static_cast<int>(text.size()), m = static_cast<int>(pattern.size());
    if (!m || m > n) return 0;
    long ph = 0, th = 0, pow = 1;
    for (int i = 0; i < m; i++) {
        ph = (ph * BASE + (unsigned char)pattern[i]) % MOD;
        th = (th * BASE + (unsigned char)text[i]) % MOD;
        if (i) pow = (pow * BASE) % MOD;
    }
    int count = 0;
    for (int i = 0; i <= n - m; i++) {
        if (ph == th && std::strncmp(text.c_str() + i, pattern.c_str(), m) == 0) count++;
        if (i < n - m) {
            th = (th - (unsigned char)text[i] * pow % MOD + MOD) % MOD;
            th = (th * BASE + (unsigned char)text[i + m]) % MOD;
        }
    }
    return count;
}

int StringMatcher::edit_distance(const std::string& a, const std::string& b) {
    int m = static_cast<int>(a.size()), n = static_cast<int>(b.size());
    if (!m) return n;
    if (!n) return m;
    if (n > m) { return edit_distance(b, a); }
    std::vector<int> prev_row(n + 1), cur_row(n + 1);
    for (int j = 0; j <= n; j++) prev_row[j] = j;
    for (int i = 1; i <= m; i++) {
        cur_row[0] = i;
        for (int j = 1; j <= n; j++) {
            int del_cost = prev_row[j];
            int ins_cost = cur_row[j-1];
            int sub_cost = prev_row[j-1];
            int m = del_cost < ins_cost ? del_cost : ins_cost;
            if (sub_cost < m) m = sub_cost;
            cur_row[j] = (a[i-1] == b[j-1]) ? prev_row[j-1] : 1 + m;
        }
        prev_row.swap(cur_row);
    }
    return prev_row[n];
}

double StringMatcher::edit_similarity(const std::string& a, const std::string& b) {
    int m = static_cast<int>(a.size()), n = static_cast<int>(b.size());
    int mx = m > n ? m : n;
    if (!mx) return 1.0;
    return 1.0 - (double)edit_distance(a, b) / mx;
}

int StringMatcher::lcs_length(const std::string& a, const std::string& b) {
    int m = static_cast<int>(a.size()), n = static_cast<int>(b.size());
    if (!m || !n) return 0;
    if (n > m) { return lcs_length(b, a); }
    std::vector<int> prev_row(n + 1, 0), cur_row(n + 1, 0);
    for (int i = 1; i <= m; i++) {
        for (int j = 1; j <= n; j++)
            cur_row[j] = (a[i-1] == b[j-1]) ? prev_row[j-1] + 1 :
                (prev_row[j] < cur_row[j-1] ? cur_row[j-1] : prev_row[j]);
        prev_row.swap(cur_row);
    }
    return prev_row[n];
}

} // namespace rl
