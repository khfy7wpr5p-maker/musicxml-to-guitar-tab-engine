# seslitab-tab-ocr-engine

Independent, safety-first guitar tablature OCR engine for PDF, PNG, and JPG documents.

## Project boundary

This repository is separate from `seslitab-guitar-reader`. It does not access Audiveris `.omr` files, MusicXML storage, SesliTab HTML, or the existing Render service. Future integration will use only a versioned HTTP/JSON API.

## Current state

This is the secure project scaffold. OCR and file upload are intentionally disabled until validation, isolation, resource-limit, and accuracy gates are implemented.

Available endpoint:

```text
GET /health
```

Reserved endpoints currently return `503 ENGINE_NOT_READY`:

```text
POST   /api/v1/tab/jobs
GET    /api/v1/tab/jobs/:id/status
GET    /api/v1/tab/jobs/:id/result
DELETE /api/v1/tab/jobs/:id
```

## Development

Requirements: Node.js 22 or 24.

```bash
npm test
npm run check
npm start
```

## Safety rule

Every OCR result must keep `requiresTeacherReview: true` until a separate, evidence-based integration decision is approved.
