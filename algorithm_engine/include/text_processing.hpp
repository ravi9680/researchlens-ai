#ifndef TEXT_PROCESSING_HPP
#define TEXT_PROCESSING_HPP

#include <string>
#include <vector>
#include <cstddef>

namespace rl {

static constexpr int TP_MAX_TOKENS = 8192;
static constexpr int TP_MAX_TOKEN_LEN = 64;

class TokenList {
public:
    std::vector<std::string> tokens;
};

class TextProcessor {
public:
    static void normalize(const std::string& in, std::string& out);
    static void tokenize(const std::string& normalized, TokenList& out, int filter_stop = 1);
    static int is_stopword(const std::string& tok);
    static unsigned long long fnv1a(const std::string& s);
    static unsigned long long doc_fingerprint(const std::string& text);
};

} // namespace rl

#endif
