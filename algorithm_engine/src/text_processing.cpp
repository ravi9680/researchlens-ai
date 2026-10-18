#include "text_processing.hpp"
#include <cctype>

namespace rl {

static const char* STOPWORDS[] = {
    "the","a","an","and","or","of","to","in","on","for","with","using","used","by",
    "from","as","is","are","was","were","be","been","that","this","these","those",
    "it","its","at","into","over","under","between","through","our","we","they",
    "their","paper","study","research","method","model","based","via","new","novel",
    "proposed","can","has","have","had","will","would","should","could","may","might",
    "about","also","such","than","then","them","there","which","while","within", nullptr
};

int TextProcessor::is_stopword(const std::string& tok) {
    for (int i = 0; STOPWORDS[i]; i++)
        if (tok == STOPWORDS[i]) return 1;
    return 0;
}

void TextProcessor::normalize(const std::string& in, std::string& out) {
    out.clear();
    out.reserve(in.size());
    for (char c : in) {
        unsigned char uc = static_cast<unsigned char>(c);
        if (std::isalnum(uc) || c == ' ')
            out.push_back(static_cast<char>(std::tolower(uc)));
        else if (c == '-' || c == '_')
            out.push_back(' ');
        else
            out.push_back(' ');
    }
}

void TextProcessor::tokenize(const std::string& normalized, TokenList& out, int filter_stop) {
    out.tokens.clear();
    size_t i = 0;
    while (i < normalized.size() && out.tokens.size() < TP_MAX_TOKENS) {
        while (i < normalized.size() && normalized[i] == ' ') i++;
        if (i >= normalized.size()) break;
        size_t j = i;
        while (j < normalized.size() && normalized[j] != ' ' && (j - i + 1) < TP_MAX_TOKEN_LEN) j++;
        std::string tok = normalized.substr(i, j - i);
        if (tok.size() < 2) { i = j; continue; }
        if (filter_stop && is_stopword(tok)) { i = j; continue; }
        out.tokens.push_back(tok);
        i = j;
    }
}

unsigned long long TextProcessor::fnv1a(const std::string& s) {
    unsigned long long h = 1469598103934665603ULL;
    for (unsigned char c : s) { h ^= c; h *= 1099511628211ULL; }
    return h;
}

unsigned long long TextProcessor::doc_fingerprint(const std::string& text) {
    size_t n = text.size();
    unsigned long long h = 1469598103934665603ULL;
    size_t step = n > 1200 ? n / 400 : 3;
    if (!step) step = 1;
    for (size_t i = 0; i < n; i += step) {
        h ^= static_cast<unsigned char>(text[i]);
        h *= 1099511628211ULL;
    }
    h ^= (unsigned long long)n * 0x9e3779b97f4a7c15ULL;
    h *= 1099511628211ULL;
    return h;
}

} // namespace rl
