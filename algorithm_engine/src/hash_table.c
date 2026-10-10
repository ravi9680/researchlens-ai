#include "hash_table.h"
#include <stdlib.h>
#include <string.h>

unsigned long ht_hash(const char *s) {
    unsigned long h = 5381;
    for (; *s; s++) h = ((h << 5) + h) + (unsigned char)*s;
    return h;
}

HashTable *ht_create(int nbuckets) {
    HashTable *ht = calloc(1, sizeof *ht);
    if (!ht) return NULL;
    ht->nbuckets = nbuckets > 0 ? nbuckets : 1024;
    ht->buckets = calloc((size_t)ht->nbuckets, sizeof(HTNode *));
    if (!ht->buckets) { free(ht); return NULL; }
    return ht;
}

void ht_free(HashTable *ht) {
    if (!ht) return;
    for (int i = 0; i < ht->nbuckets; i++) {
        HTNode *n = ht->buckets[i];
        while (n) { HTNode *nx = n->next; free(n->key); free(n); n = nx; }
    }
    free(ht->buckets); free(ht);
}

void ht_inc(HashTable *ht, const char *key) {
    unsigned long h = ht_hash(key) % (unsigned long)ht->nbuckets;
    for (HTNode *n = ht->buckets[h]; n; n = n->next)
        if (strcmp(n->key, key) == 0) { n->value++; return; }
    HTNode *nn = malloc(sizeof *nn);
    if (!nn) return;
    nn->key = malloc(strlen(key) + 1);
    if (!nn->key) { free(nn); return; }
    strcpy(nn->key, key);
    nn->value = 1;
    nn->next = ht->buckets[h];
    ht->buckets[h] = nn;
    ht->size++;
}

int ht_get(HashTable *ht, const char *key) {
    unsigned long h = ht_hash(key) % (unsigned long)ht->nbuckets;
    for (HTNode *n = ht->buckets[h]; n; n = n->next)
        if (strcmp(n->key, key) == 0) return n->value;
    return 0;
}

void ht_foreach(HashTable *ht, void (*cb)(const char *, int, void *), void *userdata) {
    for (int i = 0; i < ht->nbuckets; i++)
        for (HTNode *n = ht->buckets[i]; n; n = n->next) cb(n->key, n->value, userdata);
}
