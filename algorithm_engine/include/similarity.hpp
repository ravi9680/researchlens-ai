#ifndef SIMILARITY_HPP
#define SIMILARITY_HPP

#include "text_processing.hpp"
#include <string>

namespace rl {

class Similarity {
public:
    static double jaccard_tokens(TokenList* a, TokenList* b);
    static double cosine_tf(TokenList* a, TokenList* b);
    static int edit_distance(const std::string& a, const std::string& b);
    static double edit_similarity(const std::string& a, const std::string& b);
    static int lcs_length(const std::string& a, const std::string& b);
    static double trigram_similarity(const std::string& a, const std::string& b);
    static double lexical_score(const std::string& a, const std::string& b);
};

} // namespace rl

#endif
