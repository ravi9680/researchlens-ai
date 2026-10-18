#ifndef STRING_MATCHING_HPP
#define STRING_MATCHING_HPP

#include <string>

namespace rl {

class StringMatcher {
public:
    static int kmp_count(const std::string& text, const std::string& pattern);
    static int rk_count(const std::string& text, const std::string& pattern);
    static int edit_distance(const std::string& a, const std::string& b);
    static double edit_similarity(const std::string& a, const std::string& b);
    static int lcs_length(const std::string& a, const std::string& b);
};

} // namespace rl

#endif
