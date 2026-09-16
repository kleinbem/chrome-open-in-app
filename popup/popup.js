// Open in App - Popup Logic v1.2.0 (Hardened against XSS)

import { normalizeDomain, isSafeDomain } from '../utils/matcher.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Navigation elements
  const navTabsBtn = document.getElementById('nav-tabs-btn');
  const navSettingsBtn = document.getElementById('nav-settings-btn');
  const viewTabs = document.getElementById('view-tabs');
  const viewSettings = document.getElementById('view-settings');
  const windowModeBadge = document.getElementById('window-mode-badge');

  // Scope buttons
  const scopeCurrentBtn = document.getElementById('scope-current-btn');
  const scopeAllBtn = document.getElementById('scope-all-btn');

  // Tabs view elements
  const tabsList = document.getElementById('tabs-list');
  const tabCount = document.getElementById('tab-count');
  const btnMoveSelected = document.getElementById('btn-move-selected');
  const btnMoveText = document.getElementById('btn-move-text');
  const chkSelectAll = document.getElementById('chk-select-all');
  const selectionCountText = document.getElementById('selection-count-text');
  const btnRefresh = document.getElementById('btn-refresh');

  // Progress elements
  const progressContainer = document.getElementById('progress-container');
  const progressText = document.getElementById('progress-text');
  const progressFraction = document.getElementById('progress-fraction');
  const progressFill = document.getElementById('progress-fill');

  // Settings view elements
  const modePopupRadio = document.getElementById('mode-popup');
  const modeNormalRadio = document.getElementById('mode-normal');
  const chkIgnorePinned = document.getElementById('chk-ignore-pinned');
  const chkReuseExisting = document.getElementById('chk-reuse-existing');
  const presetsList = document.getElementById('presets-list');
  const customDomainsList = document.getElementById('custom-domains-list');
  const formAddCustom = document.getElementById('form-add-custom');
  const inputCustomDomain = document.getElementById('input-custom-domain');
  const statusMessage = document.getElementById('status-message');
  const versionLabel = document.getElementById('version-label');

  // State
  let currentConfig = {
    presets: [],
    customDomains: [],
    windowMode: 'popup',
    windowScope: 'current',
    ignorePinnedTabs: true,
    reuseExistingAppWindow: true
  };
  let currentTabs = [];
  const selectedTabIds = new Set();

  /**
   * Safe DOM Helper: Clears all child nodes without innerHTML
   */
  function clearElement(el) {
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
  }

  /**
   * Safe DOM Helper: Displays text state placeholder
   */
  function showPlaceholder(container, text, className = 'empty-state') {
    clearElement(container);
    const div = document.createElement('div');
    div.className = className;
    div.textContent = text;
    container.appendChild(div);
  }

  /**
   * Safe DOM Helper: Creates SVG Popout icon
   */
  function createPopoutSvgIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '13');
    svg.setAttribute('height', '13');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6');

    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', '15 3 21 3 21 9');

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '10');
    line.setAttribute('y1', '14');
    line.setAttribute('x2', '21');
    line.setAttribute('y2', '3');

    svg.appendChild(path);
    svg.appendChild(polyline);
    svg.appendChild(line);
    return svg;
  }

  /**
   * Safe DOM Helper: Creates SVG Delete icon
   */
  function createTrashSvgIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '13');
    svg.setAttribute('height', '13');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');

    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', '3 6 5 6 21 6');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2');

    svg.appendChild(polyline);
    svg.appendChild(path);
    return svg;
  }

  /**
   * Status message helper
   */
  function setStatus(text, isError = false) {
    statusMessage.textContent = text;
    statusMessage.style.color = isError ? 'var(--danger)' : 'var(--text-muted)';
  }

  /**
   * Navigation listeners
   */
  navTabsBtn.addEventListener('click', () => {
    navTabsBtn.classList.add('active');
    navSettingsBtn.classList.remove('active');
    viewTabs.classList.add('active');
    viewSettings.classList.remove('active');
    refreshTabs();
  });

  navSettingsBtn.addEventListener('click', () => {
    navSettingsBtn.classList.add('active');
    navTabsBtn.classList.remove('active');
    viewSettings.classList.add('active');
    viewTabs.classList.remove('active');
    loadSettings();
  });

  /**
   * Scope toggling (Current Window vs All Windows)
   */
  scopeCurrentBtn.addEventListener('click', async () => {
    if (currentConfig.windowScope === 'current') return;
    scopeCurrentBtn.classList.add('active');
    scopeAllBtn.classList.remove('active');
    currentConfig.windowScope = 'current';
    await saveConfig({ windowScope: 'current' });
    await refreshTabs();
  });

  scopeAllBtn.addEventListener('click', async () => {
    if (currentConfig.windowScope === 'all') return;
    scopeAllBtn.classList.add('active');
    scopeCurrentBtn.classList.remove('active');
    currentConfig.windowScope = 'all';
    await saveConfig({ windowScope: 'all' });
    await refreshTabs();
  });

  btnRefresh.addEventListener('click', () => {
    refreshTabs();
  });

  /**
   * Progress message listener
   */
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'PROGRESS_UPDATE') {
      const { current, total } = msg;
      progressText.textContent = `Opening tab ${current} of ${total} in app...`;
      progressFraction.textContent = `${current} / ${total}`;
      const pct = Math.round((current / total) * 100);
      progressFill.style.width = `${pct}%`;
    }
  });

  /**
   * Update selection counter
   */
  function updateSelectionUI() {
    const totalVisible = currentTabs.length;
    const selectedCount = selectedTabIds.size;

    selectionCountText.textContent = `${selectedCount} of ${totalVisible} selected`;
    chkSelectAll.checked = totalVisible > 0 && selectedCount === totalVisible;
    chkSelectAll.indeterminate = selectedCount > 0 && selectedCount < totalVisible;

    if (selectedCount === 0) {
      btnMoveSelected.disabled = true;
      btnMoveText.textContent = 'Open Selected in App (0)';
    } else {
      btnMoveSelected.disabled = false;
      btnMoveText.textContent = `Open Selected in App (${selectedCount})`;
    }
  }

  chkSelectAll.addEventListener('change', () => {
    if (chkSelectAll.checked) {
      currentTabs.forEach((t) => selectedTabIds.add(t.id));
    } else {
      selectedTabIds.clear();
    }
    const checkboxes = tabsList.querySelectorAll('.tab-select-chk input');
    checkboxes.forEach((cb) => {
      cb.checked = chkSelectAll.checked;
    });
    updateSelectionUI();
  });

  /**
   * Refresh tabs from background worker
   */
  async function refreshTabs() {
    showPlaceholder(tabsList, 'Scanning open tabs...', 'loading-state');
    btnMoveSelected.disabled = true;

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'GET_MATCHING_TABS',
        scope: currentConfig.windowScope
      });

      if (!response || !response.success) {
        showPlaceholder(tabsList, 'Failed to scan tabs', 'empty-state');
        setStatus('Failed to scan tabs', true);
        return;
      }

      currentTabs = response.tabs || [];
      tabCount.textContent = String(currentTabs.length);
      selectedTabIds.clear();

      if (currentTabs.length === 0) {
        showPlaceholder(tabsList, 'No matching app tabs found.', 'empty-state');
        updateSelectionUI();
        setStatus(`0 matching tabs in ${currentConfig.windowScope === 'all' ? 'all windows' : 'current window'}`);
        return;
      }

      currentTabs.forEach((t) => selectedTabIds.add(t.id));
      clearElement(tabsList);

      for (const tab of currentTabs) {
        const item = createTabItemElement(tab);
        tabsList.appendChild(item);
      }

      updateSelectionUI();
      setStatus(`Detected ${currentTabs.length} matching tab${currentTabs.length > 1 ? 's' : ''}`);
    } catch (err) {
      console.error('Error refreshing tabs:', err);
      showPlaceholder(tabsList, 'Error scanning tabs', 'empty-state');
      setStatus('Error scanning tabs', true);
    }
  }

  /**
   * Create tab row DOM element safely without innerHTML
   */
  function createTabItemElement(tab) {
    const card = document.createElement('div');
    card.className = 'tab-card';

    // Checkbox
    const chkWrap = document.createElement('label');
    chkWrap.className = 'tab-select-chk checkbox-container';
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = selectedTabIds.has(tab.id);

    chk.addEventListener('change', () => {
      if (chk.checked) {
        selectedTabIds.add(tab.id);
      } else {
        selectedTabIds.delete(tab.id);
      }
      updateSelectionUI();
    });
    chkWrap.appendChild(chk);

    // Tab info
    const info = document.createElement('div');
    info.className = 'tab-info';

    const icon = document.createElement('img');
    icon.className = 'tab-favicon';
    icon.src = tab.favIconUrl || '../icons/icon-16.png';
    icon.onerror = () => {
      icon.src = '../icons/icon-16.png';
    };

    const textWrap = document.createElement('div');
    textWrap.className = 'tab-text';

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = tab.title || tab.url;

    const domain = document.createElement('span');
    domain.className = 'tab-domain';
    try {
      domain.textContent = new URL(tab.url).hostname;
    } catch {
      domain.textContent = tab.url;
    }

    textWrap.appendChild(title);
    textWrap.appendChild(domain);
    info.appendChild(icon);
    info.appendChild(textWrap);

    // Popout button
    const popBtn = document.createElement('button');
    popBtn.className = 'btn-pop-tab';
    popBtn.title = 'Open this tab in app window';
    popBtn.appendChild(createPopoutSvgIcon());

    popBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      popBtn.disabled = true;
      try {
        await chrome.runtime.sendMessage({
          action: 'MOVE_SINGLE_TAB',
          tabId: tab.id,
          windowMode: currentConfig.windowMode
        });
        card.remove();
        selectedTabIds.delete(tab.id);
        currentTabs = currentTabs.filter((t) => t.id !== tab.id);
        tabCount.textContent = String(currentTabs.length);
        updateSelectionUI();
        setStatus('Opened in app window');
      } catch (err) {
        console.error('Failed to open tab in app:', err);
        popBtn.disabled = false;
        setStatus('Failed to open in app', true);
      }
    });

    card.appendChild(chkWrap);
    card.appendChild(info);
    card.appendChild(popBtn);
    return card;
  }

  /**
   * Batch open selected tabs
   */
  btnMoveSelected.addEventListener('click', async () => {
    const tabIdsToMove = Array.from(selectedTabIds);
    if (tabIdsToMove.length === 0) return;

    btnMoveSelected.disabled = true;
    btnRefresh.disabled = true;
    progressContainer.classList.add('active');
    progressText.textContent = `Opening ${tabIdsToMove.length} tabs in app...`;
    progressFraction.textContent = `0 / ${tabIdsToMove.length}`;
    progressFill.style.width = '0%';
    setStatus('Opening in app windows...');

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'MOVE_TABS',
        tabIds: tabIdsToMove,
        windowMode: currentConfig.windowMode
      });

      const count = response?.count || 0;
      progressFill.style.width = '100%';
      progressText.textContent = `Opened ${count} tab${count !== 1 ? 's' : ''}!`;

      setTimeout(() => {
        progressContainer.classList.remove('active');
      }, 1500);

      setStatus(`Successfully opened ${count} of ${tabIdsToMove.length} tabs in app!`);
      await refreshTabs();
    } catch (err) {
      console.error('Error in batch open:', err);
      progressContainer.classList.remove('active');
      setStatus('Failed to open tabs in app', true);
      btnMoveSelected.disabled = false;
      btnRefresh.disabled = false;
    }
  });

  /**
   * Settings Loader
   */
  async function loadSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'GET_CONFIG' });
      if (response && response.success) {
        currentConfig = {
          presets: response.presets || [],
          customDomains: response.customDomains || [],
          windowMode: response.windowMode || 'popup',
          windowScope: response.windowScope || 'current',
          ignorePinnedTabs: response.ignorePinnedTabs !== false,
          reuseExistingAppWindow: response.reuseExistingAppWindow !== false
        };

        if (currentConfig.windowMode === 'normal') {
          modeNormalRadio.checked = true;
          windowModeBadge.textContent = 'Normal Window';
        } else {
          modePopupRadio.checked = true;
          windowModeBadge.textContent = 'App Mode';
        }

        chkIgnorePinned.checked = currentConfig.ignorePinnedTabs;
        if (chkReuseExisting) chkReuseExisting.checked = currentConfig.reuseExistingAppWindow;

        renderPresets();
        renderCustomDomains();
      }
    } catch (err) {
      console.error('Error loading settings:', err);
      setStatus('Failed to load settings', true);
    }
  }

  modePopupRadio.addEventListener('change', async () => {
    if (modePopupRadio.checked) {
      currentConfig.windowMode = 'popup';
      windowModeBadge.textContent = 'App Mode';
      await saveConfig({ windowMode: 'popup' });
    }
  });

  modeNormalRadio.addEventListener('change', async () => {
    if (modeNormalRadio.checked) {
      currentConfig.windowMode = 'normal';
      windowModeBadge.textContent = 'Normal Window';
      await saveConfig({ windowMode: 'normal' });
    }
  });

  chkIgnorePinned.addEventListener('change', async () => {
    currentConfig.ignorePinnedTabs = chkIgnorePinned.checked;
    await saveConfig({ ignorePinnedTabs: chkIgnorePinned.checked });
  });

  if (chkReuseExisting) {
    chkReuseExisting.addEventListener('change', async () => {
      currentConfig.reuseExistingAppWindow = chkReuseExisting.checked;
      await saveConfig({ reuseExistingAppWindow: chkReuseExisting.checked });
    });
  }

  function renderPresets() {
    clearElement(presetsList);
    for (const preset of currentConfig.presets) {
      const item = document.createElement('div');
      item.className = 'preset-item';

      const label = document.createElement('div');
      label.className = 'preset-label';

      const name = document.createElement('span');
      name.className = 'preset-name';
      name.textContent = preset.name;

      const domain = document.createElement('span');
      domain.className = 'preset-domain';
      domain.textContent = preset.domain;

      label.appendChild(name);
      label.appendChild(domain);

      const toggleWrap = document.createElement('label');
      toggleWrap.className = 'switch';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = preset.enabled !== false;

      const slider = document.createElement('span');
      slider.className = 'slider';

      input.addEventListener('change', async () => {
        preset.enabled = input.checked;
        await saveConfig({ presets: currentConfig.presets });
      });

      toggleWrap.appendChild(input);
      toggleWrap.appendChild(slider);

      item.appendChild(label);
      item.appendChild(toggleWrap);
      presetsList.appendChild(item);
    }
  }

  function renderCustomDomains() {
    clearElement(customDomainsList);
    if (currentConfig.customDomains.length === 0) {
      const emptyNote = document.createElement('div');
      emptyNote.style.fontSize = '11px';
      emptyNote.style.color = 'var(--text-muted)';
      emptyNote.style.padding = '4px 0';
      emptyNote.textContent = 'No custom domains added.';
      customDomainsList.appendChild(emptyNote);
      return;
    }

    currentConfig.customDomains.forEach((domainItem, index) => {
      const item = document.createElement('div');
      item.className = 'custom-domain-item';

      const domainStr = typeof domainItem === 'string' ? domainItem : domainItem?.domain;
      const name = document.createElement('span');
      name.textContent = domainStr;

      const delBtn = document.createElement('button');
      delBtn.className = 'btn-delete-custom';
      delBtn.title = 'Remove domain';
      delBtn.appendChild(createTrashSvgIcon());

      delBtn.addEventListener('click', async () => {
        currentConfig.customDomains.splice(index, 1);
        await saveConfig({ customDomains: currentConfig.customDomains });
        renderCustomDomains();
      });

      item.appendChild(name);
      item.appendChild(delBtn);
      customDomainsList.appendChild(item);
    });
  }

  formAddCustom.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rawVal = inputCustomDomain.value;
    if (!isSafeDomain(rawVal)) {
      setStatus('Invalid or unsafe domain name', true);
      return;
    }

    const clean = normalizeDomain(rawVal);
    if (!clean) {
      setStatus('Please enter a valid domain', true);
      return;
    }

    const exists = currentConfig.customDomains.some((c) => {
      const d = typeof c === 'string' ? c : c?.domain;
      return normalizeDomain(d) === clean;
    });

    if (!exists) {
      currentConfig.customDomains.push({ domain: clean, enabled: true });
      await saveConfig({ customDomains: currentConfig.customDomains });
      renderCustomDomains();
      inputCustomDomain.value = '';
      setStatus(`Added: ${clean}`);
    } else {
      setStatus('Domain already exists');
    }
  });

  async function saveConfig(updates) {
    try {
      await chrome.runtime.sendMessage({
        action: 'SAVE_CONFIG',
        ...updates
      });
      setStatus('Settings saved');
    } catch (err) {
      console.error('Error saving config:', err);
      setStatus('Failed to save settings', true);
    }
  }

  // Initialize
  const initialConfig = await chrome.runtime.sendMessage({ action: 'GET_CONFIG' });
  if (initialConfig?.success) {
    currentConfig = {
      presets: initialConfig.presets || [],
      customDomains: initialConfig.customDomains || [],
      windowMode: initialConfig.windowMode || 'popup',
      windowScope: initialConfig.windowScope || 'current',
      ignorePinnedTabs: initialConfig.ignorePinnedTabs !== false
    };

    if (currentConfig.windowScope === 'all') {
      scopeAllBtn.classList.add('active');
      scopeCurrentBtn.classList.remove('active');
    } else {
      scopeCurrentBtn.classList.add('active');
      scopeAllBtn.classList.remove('active');
    }

    if (currentConfig.windowMode === 'normal') {
      windowModeBadge.textContent = 'Normal Window';
    } else {
      windowModeBadge.textContent = 'App Mode';
    }

    chkIgnorePinned.checked = currentConfig.ignorePinnedTabs;
    if (chkReuseExisting) chkReuseExisting.checked = currentConfig.reuseExistingAppWindow;
  }

  const manifestVersion = chrome.runtime.getManifest().version;
  if (versionLabel) {
    versionLabel.textContent = `v${manifestVersion}`;
  }
  console.log(`[Open in App v${manifestVersion}] Popup UI initialized`);

  await refreshTabs();
});
