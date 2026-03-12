# OCR API

Base path: `/api/v1/projects/{project_id}/ocr`

## Overview

OCR and text extraction for PDF papers. Uses pdfplumber for native PDFs and PaddleOCR for scanned documents.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/projects/{id}/ocr/process` | Run OCR on papers |
| GET | `/projects/{id}/ocr/stats` | OCR statistics |

## Process

`POST /projects/{id}/ocr/process` — Extract text from PDFs via OCR.

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `paper_ids` | list[int] | Optional. Specific paper IDs. If omitted, all `pdf_downloaded` papers are processed. |
| `force_ocr` | bool | Re-run OCR even if already processed (default: false) |
| `use_gpu` | bool | Use GPU for PaddleOCR (default: true) |

**Response:** `{ processed, failed, total, message? }`

## Stats

`GET /projects/{id}/ocr/stats` — Return paper counts by status and total chunk count.

**Response:** `{ metadata_only: n, pdf_downloaded: n, ocr_complete: n, indexed: n, error: n, total_chunks: n }`
