import { describe, it, expect } from "vitest";
import { jaccard, cosine, localEmbed, chunkText, fuzzyRatio } from "./services/textUtils.js";
import { detectSections, extractKeywords, textReadability, MIN_READABILITY } from "./services/documentParser.js";
import { analyzeAIWriting } from "./services/aiDetection.js";

describe("text utils (mirror C engine semantics)", () => {
  it("jaccard overlap", () => {
    expect(jaccard("phishing url detection", "phishing website detection")).toBeGreaterThan(0.2);
  });
  it("cosine embeddings deterministic", () => {
    const a = localEmbed("phishing url xgboost");
    expect(cosine(a, a)).toBeCloseTo(1, 5);
    expect(cosine(a, localEmbed("vision transformer imagenet"))).toBeLessThan(0.9);
  });
  it("chunking respects overlap", () => {
    const c = chunkText("w ".repeat(500), 100, 10);
    expect(c.length).toBeGreaterThan(4);
  });
  it("fuzzy ratio identical", () => {
    expect(fuzzyRatio("abc", "abc")).toBe(1);
  });
});

describe("document parsing", () => {
  it("detects sections", () => {
    const secs = detectSections("Title\nAbstract\nfoo bar baz qux quux\nIntroduction\nmore text here and more");
    expect(secs.length).toBeGreaterThan(0);
  });
  it("extracts keywords", () => {
    expect(extractKeywords("phishing phishing url detection xgboost phishing").length).toBeGreaterThan(0);
  });
});

describe("readability guard (binary files must not be analysed as prose)", () => {
  const PROSE = "Phishing URL detection with gradient boosting. We evaluate lexical features such as URL length, subdomain count, and character entropy. Results show gradient boosting reaches 96.2 percent accuracy on time-based splits. Limitations include concept drift and adversarial URL obfuscation.";

  it("accepts real prose", () => {
    expect(textReadability(PROSE)).toBeGreaterThan(MIN_READABILITY);
  });
  it("accepts a short but legitimate note", () => {
    expect(textReadability("A short note about phishing detection.")).toBeGreaterThan(0);
  });
  it("rejects binary noise that is long enough to pass a length check", () => {
    // Random high bytes, as produced by the PDF fallback scrape on a non-PDF file.
    let noise = "";
    for (let i = 0; i < 800; i++) noise += String.fromCharCode(160 + Math.floor(Math.random() * 95));
    expect(noise.length).toBeGreaterThan(200);
    expect(textReadability(noise)).toBeLessThan(MIN_READABILITY);
  });
  it("rejects text with no word structure", () => {
    expect(textReadability("x".repeat(400))).toBeLessThan(MIN_READABILITY);
  });
});

describe("ai signals (probabilistic)", () => {
  it("flags uniform text higher than varied text", () => {
    const uniform = Array(30).fill("Moreover this is a very generic statement about the rapidly evolving landscape.").join(" ");
    const varied = "Short. A much longer sentence with concrete numbers: 96.2% F1 on PhiUSIIL splits, unlike prior work! Why? Because features differ — URL length, entropy, subdomains... Results vary wildly across months (drift!).";
    const a = analyzeAIWriting(uniform, [{ name: "Full Text", content: uniform }]);
    const b = analyzeAIWriting(varied, [{ name: "Full Text", content: varied }]);
    expect(a.score).toBeGreaterThanOrEqual(b.score);
    expect(a.disclaimer).toMatch(/probabilistic/i);
  });
});
