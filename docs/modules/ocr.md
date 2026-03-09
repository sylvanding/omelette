# OCR Module

Native text extraction with PaddleOCR GPU fallback for scanned PDFs.

## Features

- **pdfplumber:** Extract text from digital PDFs
- **PaddleOCR:** GPU-accelerated OCR for scanned PDFs
- **Structured output:** Chunk type, section, page number

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/projects/{id}/ocr/process` | Run OCR on papers |
| GET | `/projects/{id}/ocr/stats` | OCR statistics |

## Usage Example

```bash
# Process papers
curl -X POST http://localhost:8000/api/v1/projects/1/ocr/process

# Get stats
curl http://localhost:8000/api/v1/projects/1/ocr/stats
```
