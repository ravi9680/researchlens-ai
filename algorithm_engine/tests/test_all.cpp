/* Minimal self-contained C++ tests (assert-based). Build via `make test`. */
#include <cassert>
#include <cstdio>
#include <cstring>
#include <cmath>
#include <iostream>

#include "text_processing.hpp"
#include "string_matching.hpp"
#include "similarity.hpp"
#include "hash_table.hpp"
#include "inverted_index.hpp"
#include "ranking.hpp"
#include "graph.hpp"

using namespace rl;

static int passed = 0;
#define CHECK(cond, name) do { \
    if (!(cond)) { std::printf("FAIL: %s (line %d)\n", name, __LINE__); return 1; } \
    else { passed++; } \
} while (0)

int main(void) {
    /* text processing */
    std::string out;
    TextProcessor::normalize("Hello, WORLD! Phishing-URL", out);
    CHECK(out == "hello  world  phishing url", "normalize");

    TokenList tl;
    TextProcessor::tokenize(out, tl, 1);
    CHECK(tl.tokens.size() >= 3, "tokenize count");
    CHECK(TextProcessor::is_stopword("the") == 1, "stopword");
    CHECK(TextProcessor::fnv1a("abc") != TextProcessor::fnv1a("abd"), "fnv differs");

    /* string matching */
