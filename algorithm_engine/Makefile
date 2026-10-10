CC = cc
CFLAGS = -std=c11 -Wall -Wextra -O2 -Iinclude
ASANFLAGS = -std=c11 -Wall -Wextra -g -O1 -fsanitize=address,undefined -Iinclude
SRC = src/text_processing.c src/string_matching.c src/similarity.c src/hash_table.c src/inverted_index.c src/ranking.c src/graph.c
MAIN = src/main.c
BIN = build/researchlens

all: $(BIN)

$(BIN): $(SRC) $(MAIN) include/*.h
	mkdir -p build
	$(CC) $(CFLAGS) $(SRC) $(MAIN) -o $(BIN) -lm

asan:
	mkdir -p build
	$(CC) $(ASANFLAGS) $(SRC) $(MAIN) -o build/researchlens-asan -lm

test: $(BIN) build/test_all
	./build/test_all
	@echo "--- engine smoke test ---"
	@echo '{"cmd":"fingerprint","text":"hello world research"}' | ./build/researchlens

build/test_all: tests/test_all.c $(SRC) include/*.h
	mkdir -p build
	$(CC) $(CFLAGS) tests/test_all.c $(SRC) -o build/test_all -lm

clean:
	rm -rf build
