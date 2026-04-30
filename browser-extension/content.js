// Omelette browser extension — content script
// Detects academic paper identifiers and injects a "Save to Omelette" button.

(() => {
  'use strict';

  const DOI_RE = /10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i;
  const ARXIV_ABS_RE = /arxiv\.org\/abs\/(\d{4}\.\d{4,5})/i;
  const ARXIV_PDF_RE = /arxiv\.org\/pdf\/(\d{4}\.\d{4,5})/i;

  // Extract identifiers from the current page
  function extractIdentifiers() {
    const url = window.location.href;
    let doi = null;
    let arxivId = null;
    let pdfUrl = null;
    let title = null;

    // Check URL patterns
    const arxivAbs = url.match(ARXIV_ABS_RE);
    const arxivPdf = url.match(ARXIV_PDF_RE);
    if (arxivAbs) arxivId = arxivAbs[1];
    if (arxivPdf) arxivId = arxivPdf[1];

    // arXiv PDF URL
    if (url.includes('arxiv.org/pdf/')) {
      pdfUrl = url;
    }

    // Scan page content for DOI
    const bodyText = document.body?.innerText || '';
    const doiMatch = bodyText.match(DOI_RE);
    if (doiMatch) doi = doiMatch[0];

    // Try common metadata locations
    const metaDoi = document.querySelector('meta[name="citation_doi"]');
    if (metaDoi) doi = metaDoi.getAttribute('content') || doi;

    const metaTitle = document.querySelector('meta[name="citation_title"]');
    if (metaTitle) title = metaTitle.getAttribute('content');

    // Extract title from page as fallback
    if (!title) {
      const h1 = document.querySelector('h1');
      if (h1) title = h1.textContent.trim();
    }

    // Try to find PDF link
    if (!pdfUrl) {
      const pdfLink = document.querySelector('a[href$=".pdf"]');
      if (pdfLink) {
        const href = pdfLink.getAttribute('href');
        if (href) {
          pdfUrl = href.startsWith('http') ? href : new URL(href, window.location.origin).href;
        }
      }
    }

    return { doi, arxivId, pdfUrl, title };
  }

  // Create the floating save button
  function createButton() {
    const btn = document.createElement('button');
    btn.id = 'omelette-save-btn';
    btn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
        <polyline points="17 21 17 13 7 13 7 21"/>
        <polyline points="7 3 7 8 15 8"/>
      </svg>
      Save to Omelette
    `;
    return btn;
  }

  // Check if we have enough info to save a paper
  function hasPaperInfo(identifiers) {
    return identifiers.doi || identifiers.arxivId || identifiers.pdfUrl;
  }

  // Main entry point
  function init() {
    // Check if already injected
    if (document.getElementById('omelette-save-btn')) return;

    const identifiers = extractIdentifiers();
    if (!hasPaperInfo(identifiers)) return;

    const btn = createButton();

    btn.addEventListener('click', async () => {
      // Retrieve stored settings
      const { result } = await chrome.runtime.sendMessage({
        type: 'SAVE_PAPER',
        payload: identifiers,
      });

      if (result?.success) {
        btn.classList.add('omelette-success');
        btn.innerHTML = 'Saved!';
        btn.disabled = true;
        setTimeout(() => {
          btn.classList.remove('omelette-success');
          btn.disabled = false;
          btn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
            Save to Omelette
          `;
        }, 2000);
      } else {
        btn.classList.add('omelette-error');
        btn.textContent = result?.error || 'Save failed';
        btn.disabled = true;
        setTimeout(() => {
          btn.classList.remove('omelette-error');
          btn.disabled = false;
          btn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
            Save to Omelette
          `;
        }, 3000);
      }
    });

    document.body.appendChild(btn);
  }

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 500));
  } else {
    setTimeout(init, 500);
  }
})();
