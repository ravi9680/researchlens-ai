# ResearchLens AI

> A browser-based research writing workspace for formatting, condensing, checking, and humanizing academic papers — inspired by PaperForge, rebranded and adapted for ResearchLens AI.

[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://researchlens-cqn6.onrender.com)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Live:** https://researchlens-cqn6.onrender.com  
**Note:** First load on Render free tier may take ~1 minute while the service wakes up.

---

## What it does

ResearchLens AI brings common academic writing workflows into one clean, in-browser interface:

| Tool | What it helps with |
|---|---|
| **Format Converter** | Convert raw paper text into **IEEE**, **Springer (LNCS)**, or **Elsevier** style outputs |
| **Thesis → Article** | Condense a thesis/dissertation into a journal/conference article structure |
| **Paper Check** | Review structure, length, references, and AI-sounding language before submission |
| **AI → Human** | Rewrite stiff or AI-sounding text into clearer, more natural language |
| **Export options** | Download **Word (.docx)**, **LaTeX (.tex)**, or use **Print/Save as PDF** |

## Highlights

- **Private by default workflow** — runs in the browser for the core formatting experience.
- **Multi-format export** — DOCX, LaTeX, and print-to-PDF.
- **Publisher-aware formatting** — IEEE, Springer, and Elsevier presets.
- **Submission readiness checks** — structure, keywords, references, readability, and AI-language signals.
- **Responsive UI** — designed for desktop and mobile use.
- **ResearchLens AI branding** — adapted from PaperForge (MIT) with a distinct visual identity.

## Tech stack

- **Frontend:** HTML, CSS, JavaScript (Vite build)
- **Document generation:** `docx.js`, browser print/PDF flow
- **Parsing:** `mammoth` for DOCX input in browser
- **Backend/legacy modules in repo:** Node/TypeScript + C++ research engine components (existing project modules)

## Quick start

### Frontend (current web app)

```bash
cd frontend
npm install
npm run dev
```

Open the local Vite URL shown in terminal.

### Production build

```bash
cd frontend
npm run build
```

Build output is generated in `frontend/dist`.

## Project structure

```text
.
├── frontend/                 # ResearchLens AI web UI
│   ├── index.html            # App shell
│   ├── public/
│   │   ├── app.js            # Client-side logic (parser, renderers, tools)
│   │   ├── style.css         # UI styling
│   │   └── PAPERFORGE-LICENSE.txt
│   └── package.json
├── backend/                  # Existing backend services/modules
├── algorithm_engine/         # Existing C++ research/DSA engine
├── docs/                     # Project docs
└── render.yaml               # Render deployment config
```

## Deployment

Render deployment is configured via `render.yaml`.

After deployment, verify the live build:

```bash
npm run verify:deploy https://researchlens-cqn6.onrender.com
```

## Attribution

This project’s browser formatting experience is **adapted from [PaperForge](https://github.com/aashishbharti04/paperforge)** by Aashish Bharti, originally released under the **MIT License**.  
See [`frontend/public/PAPERFORGE-LICENSE.txt`](frontend/public/PAPERFORGE-LICENSE.txt).

## Notes

- Automated formatting is a drafting aid — always review before submission.
- PDF export uses the browser print dialog (“Save as PDF”).
- For publisher-perfect LaTeX compilation, use the exported `.tex` in an editor like Overleaf.

---

Made for academic drafting and research workflows with a focus on speed, clarity, and practical output.