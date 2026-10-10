#ifndef HASH_TABLE_H
#define HASH_TABLE_H

typedef struct HTNode {
    char *key;
    int value;
    struct HTNode *next; /* chaining (linked list) */
} HTNode;

typedef struct {
    HTNode **buckets;
    int nbuckets;
    int size;
} HashTable;

HashTable *ht_create(int nbuckets);
void ht_free(HashTable *ht);
void ht_inc(HashTable *ht, const char *key);
int ht_get(HashTable *ht, const char *key);
/* Iterate: calls cb(key, value, userdata) for each entry */
void ht_foreach(HashTable *ht, void (*cb)(const char *, int, void *), void *userdata);

unsigned long ht_hash(const char *s);

#endif
