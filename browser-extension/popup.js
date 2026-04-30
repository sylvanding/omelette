// Omelette extension popup logic

const DEFAULT_BACKEND = 'http://localhost:8000';

// DOM elements
const settingsPanel = document.getElementById('settings-panel');
const savePanel = document.getElementById('save-panel');
const backendUrlInput = document.getElementById('backend-url');
const apiKeyInput = document.getElementById('api-key');
const saveSettingsBtn = document.getElementById('save-settings');
const openSettingsBtn = document.getElementById('open-settings');
const projectSelect = document.getElementById('project-select');
const tagsInput = document.getElementById('tags-input');
const saveBtn = document.getElementById('save-btn');
const paperTitle = document.getElementById('paper-title');
const statusEl = document.getElementById('status');

// State
let currentIdentifiers = null;
let projects = [];

// Load saved settings
async function loadSettings() {
  const result = await chrome.storage.local.get(['backendUrl', 'apiKey']);
  const backendUrl = result.backendUrl || DEFAULT_BACKEND;
  backendUrlInput.value = backendUrl;
  apiKeyInput.value = result.apiKey || '';
  return { backendUrl, apiKey: result.apiKey || '' };
}

// Save settings
async function saveSettings(backendUrl, apiKey) {
  await chrome.storage.local.set({ backendUrl, apiKey });
}

// Show/hide panels based on configuration
function showPanel(configured) {
  if (configured) {
    settingsPanel.classList.add('hidden');
    savePanel.classList.remove('hidden');
  } else {
    settingsPanel.classList.remove('hidden');
    savePanel.classList.add('hidden');
  }
}

// Fetch projects list from backend
async function fetchProjects(backendUrl, apiKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['X-API-Key'] = apiKey;

  try {
    const resp = await fetch(`${backendUrl}/api/v1/projects`, { headers });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    return json.data?.items || json.data || [];
  } catch (err) {
    console.error('Failed to fetch projects:', err);
    return [];
  }
}

// Populate project dropdown
function populateProjects(projectList) {
  projectSelect.innerHTML = '<option value="">Select a project...</option>';
  for (const project of projectList) {
    const opt = document.createElement('option');
    opt.value = project.id;
    opt.textContent = project.name;
    projectSelect.appendChild(opt);
  }
}

// Show status message
function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  statusEl.classList.remove('hidden');
}

function hideStatus() {
  statusEl.classList.add('hidden');
}

// Save the current paper to the selected project
async function savePaper() {
  const { backendUrl, apiKey } = await loadSettings();
  const projectId = projectSelect.value;
  if (!projectId) {
    showStatus('Please select a project first.', 'error');
    return;
  }

  saveBtn.disabled = true;
  saveBtn.classList.add('saving');
  saveBtn.textContent = 'Saving...';
  hideStatus();

  const params = new URLSearchParams();
  if (currentIdentifiers.pdfUrl) params.set('pdf_url', currentIdentifiers.pdfUrl);
  if (currentIdentifiers.doi) params.set('doi', currentIdentifiers.doi);
  if (currentIdentifiers.arxivId) params.set('arxiv_id', currentIdentifiers.arxivId);
  if (currentIdentifiers.title) params.set('title', currentIdentifiers.title);
  const tags = tagsInput.value.trim();
  if (tags) params.set('tags', tags);

  const headers = {};
  if (apiKey) headers['X-API-Key'] = apiKey;

  try {
    const url = `${backendUrl}/api/v1/projects/${projectId}/upload/browser?${params.toString()}`;
    const resp = await fetch(url, { method: 'POST', headers });
    const json = await resp.json();

    if (!resp.ok) {
      throw new Error(json.message || json.detail || 'Save failed');
    }

    const data = json.data;
    if (data.status === 'duplicate') {
      showStatus(data.message, 'success');
    } else {
      showStatus(`"${data.title}" saved successfully!`, 'success');
    }

    saveBtn.classList.remove('saving');
    saveBtn.classList.add('success');
    saveBtn.textContent = 'Saved!';
  } catch (err) {
    showStatus(err.message, 'error');
    saveBtn.classList.remove('saving');
    saveBtn.classList.add('error');
    saveBtn.textContent = 'Retry';
    saveBtn.disabled = false;
  }
}

// Update the save button enabled state
function updateSaveBtnState() {
  saveBtn.disabled = !projectSelect.value;
}

// Listen for messages from the content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SAVE_PAPER') {
    currentIdentifiers = message.payload;
    if (currentIdentifiers.title) {
      paperTitle.textContent = currentIdentifiers.title;
    } else {
      paperTitle.textContent = 'Paper detected — save to your project below';
    }
    sendResponse({ success: true });
  }
});

// Initialize on popup open
(async function init() {
  const { backendUrl, apiKey } = await loadSettings();
  const configured = !!apiKey;
  showPanel(configured);

  if (configured) {
    // Get paper info from active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Try to extract info from the tab URL
    let identifiers = {};
    if (tab.url) {
      const url = tab.url;
      const arxivAbs = url.match(/arxiv\.org\/abs\/(\d{4}\.\d{4,5})/i);
      const arxivPdf = url.match(/arxiv\.org\/pdf\/(\d{4}\.\d{4,5})/i);
      if (arxivAbs) identifiers.arxivId = arxivAbs[1];
      if (arxivPdf) identifiers.arxivId = arxivPdf[1];
      if (url.includes('arxiv.org/pdf/')) identifiers.pdfUrl = url;

      // Check for PDF URL
      if (url.endsWith('.pdf')) identifiers.pdfUrl = url;
    }

    // Also try to get info from content script
    try {
      const results = await chrome.tabs.sendMessage(tab.id, { type: 'GET_IDENTIFIERS' });
      if (results) {
        identifiers = { ...identifiers, ...results };
      }
    } catch {
      // Content script not available, that's OK
    }

    // Use page title as fallback
    if (!identifiers.title && tab.title) {
      identifiers.title = tab.title;
    }

    currentIdentifiers = identifiers;
    if (identifiers.title) {
      paperTitle.textContent = identifiers.title;
    }

    // Fetch projects
    projects = await fetchProjects(backendUrl, apiKey);
    populateProjects(projects);

    // Auto-select if only one project
    if (projects.length === 1) {
      projectSelect.value = projects[0].id;
    }
  }

  // Event listeners
  saveSettingsBtn.addEventListener('click', async () => {
    await saveSettings(backendUrlInput.value.trim(), apiKeyInput.value.trim());
    chrome.runtime.reload();
  });

  openSettingsBtn.addEventListener('click', () => {
    apiKeyInput.value = '';
    showPanel(false);
  });

  projectSelect.addEventListener('change', updateSaveBtnState);
  saveBtn.addEventListener('click', savePaper);
  updateSaveBtnState();
})();
