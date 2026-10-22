import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";

/* Interaction tests.
 *
 * The previous suite only server-rendered each page, which proves the
 * components do not throw but says nothing about behaviour. These tests
 * mount the app, click and type, and assert on what the user sees.
 *
 * The most important case is the first one: a brand-new visitor with no
 * token must reach the dashboard. The old flow redirected to the login page,
 * whose "continue as guest" link pointed straight back — a loop that made
 * the whole application unreachable without registering. */

type FetchCall = { url: string; init?: any };

function mockFetch(handlers: (url: string, init?: any) => { status?: number; body?: any } | undefined) {
  const calls: FetchCall[] = [];
  (globalThis as any).fetch = vi.fn(async (url: any, init?: any) => {
    const u = String(url);
    calls.push({ url: u, init });
    const h = handlers(u, init);
    const status = h?.status ?? 200;
    const body = h?.body ?? {};
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as any;
  });
  return calls;
}

function wrap(el: ReactNode, path = "/") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>{el}</MemoryRouter>
    </QueryClientProvider>
  );
}

const ME = { id: "u1", email: "guest_abcd1234@guest.researchlens.local", name: "Guest Researcher", role: "user" };

beforeEach(() => {
  // The layout reads the token from localStorage; an empty store is exactly
  // the "first visit" case.
  localStorage.clear();
});

describe("first-visit guest bootstrap", () => {
  it("mints a guest identity and reaches the dashboard instead of looping to the login page", async () => {
    const calls = mockFetch((url) => {
      if (url.includes("/auth/guest")) {
        return { body: { token: "guest-token", refreshToken: "guest-refresh", user: ME } };
      }
      if (url.includes("/auth/me")) return { body: ME };
      if (url.includes("/dashboard/stats")) {
        return {
          body: {
            totalPapers: 31, totalAuthors: 40, totalTopics: 10, analyses: 0,
            avgSimilarity: 0, recent: [],
          },
        };
      }
      return { body: {} };
    });

    const { Layout } = await import("./components/Layout");
    const { Dashboard } = await import("./pages/Dashboard");

    wrap(
      <Routes>
        <Route path="/app" element={<Layout />}>
          <Route index element={<Dashboard />} />
        </Route>
      </Routes>,
      "/app"
    );

    // A guest identity is requested automatically…
    await waitFor(() => {
      expect(calls.some((c) => c.url.includes("/auth/guest"))).toBe(true);
    });
    // …and the user lands on the dashboard, not on a login screen.
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Dashboard/i })).toBeTruthy();
    });
    // The login form is never shown to a guest.
    expect(screen.queryByRole("button", { name: /Log in to your account/i })).toBeNull();
  });

  it("does not mint a second guest when a token already exists", async () => {
    localStorage.setItem("rl_token", "existing-token");
    const calls = mockFetch((url) => {
      if (url.includes("/auth/me")) return { body: ME };
      if (url.includes("/dashboard/stats")) {
        return { body: { totalPapers: 1, totalAuthors: 1, totalTopics: 1, analyses: 0, avgSimilarity: 0, recent: [] } };
      }
      return { body: {} };
    });

    const { Layout } = await import("./components/Layout");
    const { Dashboard } = await import("./pages/Dashboard");

    wrap(
      <Routes>
        <Route path="/app" element={<Layout />}>
          <Route index element={<Dashboard />} />
        </Route>
      </Routes>,
      "/app"
    );

    await waitFor(() => expect(screen.getByRole("heading", { name: /Dashboard/i })).toBeTruthy());
    expect(calls.some((c) => c.url.includes("/auth/guest"))).toBe(false);
  });
});

describe("upload validation", () => {
  it("rejects a file type that is not PDF, DOCX or TXT before contacting the server", async () => {
    const calls = mockFetch(() => undefined);
    const { Upload } = await import("./pages/Upload");
    wrap(<Upload />);

    const file = new File(["<html></html>"], "page.html", { type: "text/html" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    // applyAccept:false — the input has an `accept` attribute, and the
    // default behaviour would silently drop the file instead of letting the
    // component's own validation run.
    await userEvent.upload(input, file, { applyAccept: false });

    await waitFor(() => {
      expect(screen.getByText(/Only PDF, DOCX and TXT/i)).toBeTruthy();
    });
    // The server must never be asked to store an invalid file.
    expect(calls.some((c) => c.url.includes("/api/upload"))).toBe(false);
  });

  it("rejects a file over the size limit before uploading", async () => {
    const calls = mockFetch(() => undefined);
    const { Upload } = await import("./pages/Upload");
    wrap(<Upload />);

    const big = new File(["x".repeat(26 * 1024 * 1024)], "big.txt", { type: "text/plain" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, big);

    await waitFor(() => {
      expect(screen.getByText(/over the 25 MB limit/i)).toBeTruthy();
    });
    expect(calls.some((c) => c.url.includes("/api/upload"))).toBe(false);
  });
});

describe("auth form", () => {
  it("shows a live password strength meter and blocks a weak password", async () => {
    mockFetch(() => ({ body: {} }));
    const { Auth } = await import("./pages/Auth");
    wrap(<Auth />);

    // Switch to the register tab.
    await userEvent.click(screen.getByRole("button", { name: /Create account/i }));

    const email = screen.getByLabelText(/Email/i) as HTMLInputElement;
    const pw = screen.getByLabelText(/Password/i) as HTMLInputElement;
    await userEvent.type(email, "ada@example.com");
    await userEvent.type(pw, "abc");

    await waitFor(() => expect(screen.getByText(/Too weak/i)).toBeTruthy());

    await userEvent.clear(pw);
    await userEvent.type(pw, "Str0ng!Passphrase");
    await waitFor(() => expect(screen.getByText(/Strong/i)).toBeTruthy());
  });

  it("rejects a malformed email without calling the API", async () => {
    const calls = mockFetch(() => ({ body: {} }));
    const { Auth } = await import("./pages/Auth");
    wrap(<Auth />);

    await userEvent.type(screen.getByLabelText(/Email/i), "not-an-email");
    await userEvent.type(screen.getByLabelText(/Password/i), "secret123");
    await userEvent.click(screen.getByRole("button", { name: /Log in to your account/i }));

    await waitFor(() => expect(screen.getByText(/valid email/i)).toBeTruthy());
    expect(calls.some((c) => c.url.includes("/auth/login"))).toBe(false);
  });
});

describe("research explorer", () => {
  it("shows the result count and a relevance badge for each paper", async () => {
    mockFetch((url) => {
      if (url.includes("/api/papers?")) {
        return {
          body: {
            total: 2, page: 1, items: [
              { id: "p1", title: "Phishing URL Detection", abstract: "abs", year: 2023, authors: ["A"], venue: "V", citation_count: 5, is_demo: false, relevance: 3.4 },
              { id: "p2", title: "Vision Transformers", abstract: "abs2", year: 2024, authors: ["B"], venue: "V2", citation_count: 6, is_demo: true, relevance: 0.8 },
            ],
          },
        };
      }
      if (url.includes("/api/papers/saved")) return { body: [] };
      return { body: {} };
    });

    const { Explorer } = await import("./pages/Explore");
    wrap(<Explorer />);

    await waitFor(() => expect(screen.getAllByText(/Phishing URL Detection/).length).toBeGreaterThan(0));
    expect(screen.getByText(/2 indexed papers/i)).toBeTruthy();
    // The relevance score is surfaced, and demo rows are badged.
    expect(screen.getByText(/relevance 3\.4/i)).toBeTruthy();
    expect(screen.getByText("DEMO")).toBeTruthy();
    // The card is a stretched link, so the paper has an accessible name.
    expect(screen.getByRole("link", { name: /Phishing URL Detection/i })).toBeTruthy();
  });

  it("re-queries the API when the search term changes", async () => {
    const calls = mockFetch((url) => {
      if (url.includes("/api/papers?")) return { body: { total: 0, page: 1, items: [] } };
      if (url.includes("/api/papers/saved")) return { body: [] };
      return { body: {} };
    });

    const { Explorer } = await import("./pages/Explore");
    wrap(<Explorer />);

    const input = screen.getByPlaceholderText(/Search titles and abstracts/i);
    await userEvent.type(input, "graph");

    await waitFor(() => {
      expect(calls.some((c) => c.url.includes("search=graph"))).toBe(true);
    });
  });
});

describe("stalled analysis", () => {
  it("offers a retry instead of an endless progress bar when the stage goes stale", async () => {
    let retried = 0;
    mockFetch((url, init) => {
      if (url.includes("/retry")) { retried++; return { body: { documentId: "d1", status: "processing" } }; }
      if (url.includes("/documents/d1/status")) {
        return {
          body: {
            id: "d1", stage: "C_ENGINE", progress: 52, error: "", title: "Sample",
            done: false, failed: false,
            elapsedMs: 600_000, stale: true, canRetry: true,
          },
        };
      }
      return { body: {} };
    });

    const { Processing } = await import("./pages/Processing");
    wrap(
      <Routes>
        <Route path="/app/processing/:id" element={<Processing />} />
      </Routes>,
      "/app/processing/d1"
    );

    await waitFor(() => expect(screen.getByText(/stopped responding/i)).toBeTruthy());
    expect(screen.getByText(/C ENGINE/i)).toBeTruthy();

    const retry = screen.getByRole("button", { name: /Retry analysis/i });
    await userEvent.click(retry);
    await waitFor(() => expect(retried).toBe(1));
  });

  it("shows the elapsed time while the analysis is running normally", async () => {
    mockFetch((url) => {
      if (url.includes("/documents/d1/status")) {
        return {
          body: {
            id: "d1", stage: "SIMILARITY", progress: 76, error: "", title: "Sample",
            done: false, failed: false, elapsedMs: 12_000, stale: false, canRetry: false,
          },
        };
      }
      return { body: {} };
    });

    const { Processing } = await import("./pages/Processing");
    wrap(
      <Routes>
        <Route path="/app/processing/:id" element={<Processing />} />
      </Routes>,
      "/app/processing/d1"
    );

    // Wait for the polled status to arrive (the stage list renders
    // immediately, so it cannot be used as the readiness signal).
    await waitFor(() => expect(document.body.textContent).toContain("76%"));
    // No stale warning while the stage is still advancing.
    expect(screen.queryByText(/stopped responding/i)).toBeNull();
  });
});

describe("grounded chat", () => {
  it("sends a question and renders the grounded answer with its references", async () => {
    mockFetch((url) => {
      if (url.includes("/api/chat")) {
        return {
          body: {
            answer: "Based on 1 retrieved paper(s): the literature associates this with phishing.",
            references: [{ id: "p1", title: "Phishing URL Detection", year: 2023 }],
            evidence: [{ paper: "Phishing URL Detection", section: "Abstract", excerpt: "…", relevance: 71 }],
            grounded: true,
            note: "Answer is grounded only in retrieved chunks above.",
          },
        };
      }
      return { body: {} };
    });

    const { Chat } = await import("./pages/ChatReview");
    wrap(<Chat />);

    const box = screen.getByPlaceholderText(/Ask a research question/i);
    await userEvent.type(box, "how is phishing detected?");
    await userEvent.click(screen.getByLabelText("Send"));

    await waitFor(() => {
      expect(screen.getByText(/the literature associates this with phishing/i)).toBeTruthy();
    });
    expect(screen.getByText("Phishing URL Detection")).toBeTruthy();
    expect(screen.getByText(/71% match/i)).toBeTruthy();
  });

  it("shows the abstention notice when the model cannot ground an answer", async () => {
    mockFetch((url) => {
      if (url.includes("/api/chat")) {
        return {
          body: {
            answer: "I couldn't find enough evidence in the indexed literature to answer that.",
            references: [], grounded: false,
          },
        };
      }
      return { body: {} };
    });

    const { Chat } = await import("./pages/ChatReview");
    wrap(<Chat />);

    await userEvent.type(screen.getByPlaceholderText(/Ask a research question/i), "zzz qqq");
    await userEvent.click(screen.getByLabelText("Send"));

    await waitFor(() => {
      expect(screen.getByText(/Not enough indexed evidence/i)).toBeTruthy();
    });
  });
});
