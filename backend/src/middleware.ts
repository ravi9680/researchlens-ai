import { config } from "./config.js";

/** Global Express error handler.
 *  Shared by the real server and the API test app so both answer identically.
 *  Client mistakes (file too large, wrong type, too many files) must be a 400
 *  with a useful message — a bare 500 hides the real cause from the user. */
export function apiErrorHandler(err: any, _req: any, res: any, _next: any) {
  // Multer's own errors are client mistakes, not server faults.
  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ error: `File is too large. Maximum size is ${config.maxFileMb} MB.` });
  }
  if (err?.code === "LIMIT_UNEXPECTED_FILE" || err?.code === "LIMIT_FILE_COUNT") {
    return res.status(400).json({ error: "Upload a single file using the 'file' field." });
  }
  const msg = String(err?.message || "");
  if (msg.includes("Only PDF") || msg.includes("Only PDF, DOCX")) {
    return res.status(400).json({ error: msg });
  }
  console.error("[api]", err?.message || err);
  res.status(500).json({ error: "Internal error" });
}
