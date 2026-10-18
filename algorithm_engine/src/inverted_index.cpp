#include "inverted_index.hpp"
#include "ranking.hpp"
#include <cmath>
#include <algorithm>

namespace rl {

InvertedIndex::InvertedIndex() : ndocs_(0) {}

InvertedIndex::~InvertedIndex() = default;

const TermEntry* InvertedIndex::find(const std::string& term) const {
    for (const auto& e : terms_)
        if (e.term == term) return &e;
    return nullptr;
}

TermEntry* InvertedIndex::get_or_create(const std::string& term) {
    for (auto& e : terms_)
        if (e.term == term) return &e;
    if (static_cast<int>(terms_.size()) >= InvertedIndex::II_MAX_TERMS) return nullptr;
    terms_.emplace_back();
    auto* e = &terms_.back();
    e->term = term;
    e->doc_freq = 0;
    return e;
}

void InvertedIndex::add_doc(int doc_id, const std::vector<std::string>& tokens) {
    if (doc_id >= InvertedIndex::II_MAX_DOCS) return;
    if (static_cast<int>(doc_lens_.size()) <= doc_id)
        doc_lens_.resize(doc_id + 1, 0);
    ndocs_ = std::max(ndocs_, doc_id + 1);
    doc_lens_[doc_id] = static_cast<int>(tokens.size());
    for (const auto& tok : tokens) {
        TermEntry* e = get_or_create(tok);
        if (!e) continue;
        bool found = false;
        for (auto& p : e->postings) {
            if (p.doc_id == doc_id) { p.freq++; found = true; break; }
        }
        if (!found) {
            e->postings.push_back({doc_id, 1});
            e->doc_freq = static_cast<int>(e->postings.size());
        }
    }
}

int InvertedIndex::search(const std::vector<std::string>& query, ScoredDoc* out, int top_k) const {
    if (ndocs_ == 0) return 0;
    std::vector<double> scores(ndocs_, 0.0);
    for (const auto& q : query) {
        const TermEntry* e = find(q);
        if (!e || e->doc_freq == 0) continue;
        double idf = std::log((1.0 + ndocs_) / (1.0 + e->doc_freq)) + 1.0;
        for (const auto& p : e->postings) {
            int d = p.doc_id;
            if (d < 0 || d >= ndocs_) continue;
            double tf = 1.0 + std::log((double)p.freq);
            double norm = doc_lens_[d] ? std::sqrt((double)doc_lens_[d]) : 1.0;
            scores[d] += (tf * idf) / norm;
        }
    }
    MinHeap h(top_k > 0 ? top_k : 10);
    for (int d = 0; d < ndocs_; d++)
        if (scores[d] > 0) h.push(d, scores[d]);
    RankItem tmp[256];
    int got = h.drain_desc(tmp);
    for (int i = 0; i < got; i++) { out[i].doc_id = tmp[i].id; out[i].score = tmp[i].score; }
    return got;
}

TrieNode::TrieNode() {
    for (int i = 0; i < 26; i++) child[i] = nullptr;
    is_end = 0; count = 0;
}

TrieNode::~TrieNode() {
    for (int i = 0; i < 26; i++) if (child[i]) delete child[i];
}

void TrieNode::insert(const std::string& word) {
    TrieNode* n = this;
    for (char c : word) {
        if (c >= 'A' && c <= 'Z') c += 32;
        if (c < 'a' || c > 'z') continue;
        int k = c - 'a';
        if (!n->child[k]) n->child[k] = new TrieNode();
        if (!n->child[k]) return;
        n = n->child[k];
    }
    n->is_end = 1; n->count++;
}

int TrieNode::search(const std::string& word) const {
    const TrieNode* n = this;
    for (char c : word) {
        if (c >= 'A' && c <= 'Z') c += 32;
        if (c < 'a' || c > 'z') continue;
        n = n->child[c - 'a'];
        if (!n) return 0;
    }
    return n->is_end ? n->count : 0;
}

int TrieNode::prefix_count(const std::string& prefix) const {
    const TrieNode* n = this;
    for (char c : prefix) {
        if (c >= 'A' && c <= 'Z') c += 32;
        if (c < 'a' || c > 'z') continue;
        n = n->child[c - 'a'];
        if (!n) return 0;
    }
    int s = n->count;
    for (int i = 0; i < 26; i++) if (n->child[i]) s += n->child[i]->prefix_count("");
    return s;
}

} // namespace rl
