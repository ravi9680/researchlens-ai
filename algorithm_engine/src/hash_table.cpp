#include "hash_table.hpp"
#include <cstring>

namespace rl {

unsigned long HashTable::hash(const std::string& s) const {
    unsigned long h = 5381;
    for (char c : s) h = ((h << 5) + h) + (unsigned char)c;
    return h;
}

HashTable::HashTable(int nbuckets) {
    nbuckets_ = nbuckets > 0 ? nbuckets : 1024;
    buckets_ = new HTNode*[nbuckets_]();
    size_ = 0;
}

HashTable::~HashTable() {
    for (int i = 0; i < nbuckets_; i++) {
        HTNode* n = buckets_[i];
        while (n) { HTNode* nx = n->next; delete n; n = nx; }
    }
    delete[] buckets_;
}

void HashTable::inc(const std::string& key) {
    unsigned long h = hash(key) % (unsigned long)nbuckets_;
    for (HTNode* n = buckets_[h]; n; n = n->next)
        if (n->key == key) { n->value++; return; }
    HTNode* nn = new HTNode{ key, 1, buckets_[h] };
    buckets_[h] = nn;
    size_++;
}

int HashTable::get(const std::string& key) const {
    unsigned long h = hash(key) % (unsigned long)nbuckets_;
    for (HTNode* n = buckets_[h]; n; n = n->next)
        if (n->key == key) return n->value;
    return 0;
}

void HashTable::foreach(void (*cb)(const std::string&, int, void*), void* userdata) {
    for (int i = 0; i < nbuckets_; i++)
        for (HTNode* n = buckets_[i]; n; n = n->next) cb(n->key, n->value, userdata);
}

} // namespace rl
