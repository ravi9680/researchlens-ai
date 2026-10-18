#ifndef INVERTED_INDEX_HPP
#define INVERTED_INDEX_HPP

#include <string>
#include <vector>
#include <cstddef>

namespace rl {

struct Posting {
    int doc_id;
    int freq;
};

struct TermEntry {
    std::string term;
    std::vector<Posting> postings;
    int doc_freq;
};

struct ScoredDoc {
    int doc_id;
    double score;
};

class InvertedIndex {
public:
    static constexpr int II_MAX_TERMS = 16384;
    static constexpr int II_MAX_DOCS = 4096;

    InvertedIndex();
    ~InvertedIndex();
    void add_doc(int doc_id, const std::vector<std::string>& tokens);
    int search(const std::vector<std::string>& query, ScoredDoc* out, int top_k) const;

    int nterms() const { return static_cast<int>(terms_.size()); }
    int ndocs() const { return ndocs_; }

private:
    std::vector<TermEntry> terms_;
    int ndocs_;
    std::vector<int> doc_lens_;
    const TermEntry* find(const std::string& term) const;
    TermEntry* get_or_create(const std::string& term);
};

class TrieNode {
public:
    TrieNode* child[26];
    int is_end;
    int count;

    TrieNode();
    ~TrieNode();
    void insert(const std::string& word);
    int search(const std::string& word) const;
    int prefix_count(const std::string& prefix) const;
};

} // namespace rl

#endif
