import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
  demoMode: (process.env.DEMO_MODE || "true") !== "false",
  databaseUrl: process.env.DATABASE_URL || "",
  uploadDir: process.env.UPLOAD_DIR || "./uploads",
  maxFileMb: Number(process.env.MAX_FILE_MB || 25),
  crossrefEmail: process.env.CROSSREF_EMAIL || "",
  openalexEmail: process.env.OPENALEX_EMAIL || "",
  semanticScholarKey: process.env.SEMANTIC_SCHOLAR_API_KEY || "",
};
