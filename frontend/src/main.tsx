import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import { queryClient } from "./lib/api";
import { Layout } from "./components/Layout";
import { Landing } from "./pages/Landing";
import { Dashboard } from "./pages/Dashboard";
import { Upload } from "./pages/Upload";
import { Processing } from "./pages/Processing";
import { Results } from "./pages/Results";
import { SimilarPapers, Gaps } from "./pages/SimilarGaps";
import { Explorer, PaperDetails, Compare } from "./pages/Explore";
import { Chat, LitReview } from "./pages/ChatReview";
import { Trends, CitationGraph, Knowledge, Admin } from "./pages/Analytics";
import { Algorithms, Settings } from "./pages/AlgorithmsSettings";
import { Auth } from "./pages/Auth";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/app" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="upload" element={<Upload />} />
            <Route path="processing/:id" element={<Processing />} />
            <Route path="results/:id" element={<Results />} />
            <Route path="similar/:id" element={<SimilarPapers />} />
            <Route path="gaps/:id" element={<Gaps />} />
            <Route path="explorer" element={<Explorer />} />
            <Route path="paper/:id" element={<PaperDetails />} />
            <Route path="compare" element={<Compare />} />
            <Route path="chat" element={<Chat />} />
            <Route path="review" element={<LitReview />} />
            <Route path="trends" element={<Trends />} />
            <Route path="graph" element={<CitationGraph />} />
            <Route path="knowledge" element={<Knowledge />} />
            <Route path="admin" element={<Admin />} />
            <Route path="algorithms" element={<Algorithms />} />
            <Route path="settings" element={<Settings />} />
            <Route path="auth" element={<Auth />} />
          </Route>
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
