CXX = g++
CXXFLAGS = -std=c++17 -Wall -Wextra -O2 -Iinclude
ASANFLAGS = -std=c++17 -Wall -Wextra -g -O1 -fsanitize=address,undefined -Iinclude
SRC = src/text_processing.cpp src/string_matching.cpp src/similarity.cpp \
      src/hash_table.cpp src/inverted_index.cpp src/ranking.cpp src/graph.cpp
MAIN = src/main.cpp
BIN = build/researchlens

all: $(BIN)

$(BIN): $(SRC) $(MAIN) include/*.hpp
	mkdir -p build
	$(CXX) $(CXXFLAGS) $(SRC) $(MAIN) -o $(BIN) -lm

asan:
	mkdir -p build
	$(CXX) $(ASANFLAGS) $(SRC) $(MAIN) -o build/researchlens-asan -lm

test: $(BIN) build/test_all
	./build/test_all
	@echo "--- engine smoke test ---"
	@echo '{"cmd":"fingerprint","text":"hello world research"}' | ./build/researchlens

build/test_all: tests/test_all.cpp $(SRC) include/*.hpp
	mkdir -p build
	$(CXX) $(CXXFLAGS) tests/test_all.cpp $(SRC) -o build/test_all -lm

clean:
	rm -rf build
