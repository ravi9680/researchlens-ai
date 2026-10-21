import { StrictMode, Component, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import { queryClient } from "./lib/api";
import { Layout } from "./components/Layout";
import { Landing } from "./pages/Landing";
import { Dashboard } from "./pages/Dashboard";
import { Upload } from "./pages/Upload";
import { Processing } from "./pages/Processing";
import { Results } from "./pages/Results";
import { SimilarPapers } from "./pages/SimilarGaps";
import { Explorer, PaperDetails } from "./pages/Explore";
import { Saved } from "./pages/Saved";
import { Chat } from "./pages/ChatReview";
import { Trends } from "./pages/Analytics";
import { Algorithms, Settings } from "./pages/AlgorithmsSettings";
import { Auth } from "./pages/Auth";
import { GraphLab } from "./pages/GraphLab";
import { Compare } from "./pages/Compare";
import { Review } from "./pages/Review";
import { Security } from "./pages/Security";

// Error boundary to prevent one crash from taking down the whole app
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-8">
          <div className="card p-8 max-w-md text-center">
            <p className="text-2xl font-semibold">Something went wrong</p>
            <p className="mt-2 text-sm text-slate-500">{this.state.error.message}</p>
            <button className="btn-primary mt-4" onClick={() => this.setState({ error: null })}>Try again</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// 404 page
function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-6xl font-bold text-indigo-600">404</p>
      <p className="mt-3 text-xl font-semibold">Page not found</p>
      <p className="mt-2 text-sm text-slate-500">The page you're looking for doesn't exist.</p>
      <Link to="/app" className="btn-primary mt-6">Go to Dashboard</Link>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
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
              <Route path="explorer" element={<Explorer />} />
              <Route path="paper/:id" element={<PaperDetails />} />
              <Route path="chat" element={<Chat />} />
              <Route path="trends" element={<Trends />} />
              <Route path="graph" element={<GraphLab />} />
              <Route path="compare" element={<Compare />} />
              <Route path="review" element={<Review />} />
              <Route path="saved" element={<Saved />} />
              <Route path="algorithms" element={<Algorithms />} />
              <Route path="security" element={<Security />} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<NotFound />} />
            </Route>
            <Route path="/app/auth" element={<Auth />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
);
