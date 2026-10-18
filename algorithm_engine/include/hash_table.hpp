#ifndef HASH_TABLE_HPP
#define HASH_TABLE_HPP

#include <string>
#include <cstddef>

namespace rl {

struct HTNode {
    std::string key;
    int value;
    HTNode* next;
};

class HashTable {
public:
    HashTable(int nbuckets = 1024);
    ~HashTable();
    void inc(const std::string& key);
    int get(const std::string& key) const;
    void foreach(void (*cb)(const std::string&, int, void*), void* userdata);
    int size() const { return size_; }

private:
    HTNode** buckets_;
    int nbuckets_;
    int size_;
    unsigned long hash(const std::string& s) const;
};

} // namespace rl

#endif
