// Tabs to PWA - Popup Logic

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const navTabsBtn = document.getElementById('nav-tabs-btn');
  const navSettingsBtn = document.getElementById('nav-settings-btn');
  const viewTabs = document.getElementById('view-tabs');
  const viewSettings = document.getElementById('view-settings');
  const tabsList = document.getElementById('tabs-list');
  const tabCount = document.getElementById('tab-count');
  const btnMoveAll = document.getElementById('btn-move-all');
  const btnMoveAllText = document.getElementById('btn-move-all-text');
  const chkAllWindows = document.getElementById('chk-all-windows');
  const presetsList = document.getElementById('presets-list');
  const customDomainsList = document.getElementById('custom-domains-list');
  const formAddCustom = document.getElementById('form-add-custom');
  const inputCustomDomain = document.getElementById('input-custom-domain');
  const statusMessage = document.getElementById('status-message');

  let currentConfig = { presets: [], customDomains: [] };

  // View navigation
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

  chkAllWindows.addEventListener('change', () => {
    refreshTabs();
  });

  /**
   * Status display helper
   */
  function setStatus(text, isError = false) {
    statusMessage.textContent = text;
    statusMessage.style.color = isError ? 'var(--danger)' : 'var(--text-muted)';
  }

  /**
   * Refresh matching tabs
   */
  async function refreshTabs() {
    tabsList.innerHTML = '<div class="loading-state">Scanning open tabs...</div>';
    try {
      const currentWin = await chrome.windows.getCurrent();
      const windowId = chkAllWindows.checked ? null : currentWin.id;

      const response = await chrome.runtime.sendMessage({
        action: 'GET_MATCHING_TABS',
        windowId
      });

      if (!response || !response.success) {
        tabsList.innerHTML = '<div class="empty-state">Failed to scan tabs</div>';
        return;
      }

      const tabs = response.tabs || [];
      tabCount.textContent = String(tabs.length);

      if (tabs.length === 0) {
        tabsList.innerHTML = '<div class="empty-state">No matching PWA tabs found in this window.</div>';
        btnMoveAll.disabled = true;
        btnMoveAllText.textContent = 'Move All to PWA Windows';
        setStatus('No matching tabs found');
        return;
      }

      btnMoveAll.disabled = false;
      btnMoveAllText.textContent = `Move All to PWA Windows (${tabs.length})`;
      tabsList.innerHTML = '';

      for (const tab of tabs) {
        const item = createTabItemElement(tab);
        tabsList.appendChild(item);
      }
      setStatus(`Detected ${tabs.length} eligible tab${tabs.length > 1 ? 's' : ''}`);
    } catch (err) {
      console.error('Error refreshing tabs:', err);
      tabsList.innerHTML = '<div class="empty-state">Error loading tabs</div>';
      setStatus('Error scanning tabs', true);
    }
  }

  /**
   * Create tab row DOM element
   */
  function createTabItemElement(tab) {
    const card = document.createElement('div');
    card.className = 'tab-card';

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

    const popBtn = document.createElement('button');
    popBtn.className = 'btn-pop-tab';
    popBtn.title = 'Move this tab to PWA window';
    popBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
        <polyline points="15 3 21 3 21 9"></polyline>
        <line x1="10" y1="14" x2="21" y2="3"></line>
      </svg>
    `;

    popBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      popBtn.disabled = true;
      try {
        await chrome.runtime.sendMessage({
          action: 'MOVE_TAB',
          tabId: tab.id
        });
        card.remove();
        await refreshTabs();
      } catch (err) {
        console.error('Failed to move tab:', err);
        popBtn.disabled = false;
      }
    });

    card.appendChild(info);
    card.appendChild(popBtn);
    return card;
  }

  /**
   * Move All button click
   */
  btnMoveAll.addEventListener('click', async () => {
    btnMoveAll.disabled = true;
    btnMoveAllText.textContent = 'Moving tabs...';
    setStatus('Creating standalone windows...');

    try {
      const currentWin = await chrome.windows.getCurrent();
      const windowId = chkAllWindows.checked ? null : currentWin.id;

      const response = await chrome.runtime.sendMessage({
        action: 'MOVE_ALL_TABS',
        windowId
      });

      const count = response?.count || 0;
      setStatus(`Moved ${count} tab${count !== 1 ? 's' : ''} to PWA windows!`);
      await refreshTabs();
    } catch (err) {
      console.error('Error moving all tabs:', err);
      setStatus('Failed to move tabs', true);
      btnMoveAll.disabled = false;
      btnMoveAllText.textContent = 'Move All to PWA Windows';
    }
  });

  /**
   * Load and render settings
   */
  async function loadSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'GET_CONFIG' });
      if (response && response.success) {
        currentConfig = {
          presets: response.presets || [],
          customDomains: response.customDomains || []
        };
        renderPresets();
        renderCustomDomains();
      }
    } catch (err) {
      console.error('Error loading settings:', err);
      setStatus('Failed to load settings', true);
    }
  }

  function renderPresets() {
    presetsList.innerHTML = '';
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
        await saveConfig();
      });

      toggleWrap.appendChild(input);
      toggleWrap.appendChild(slider);

      item.appendChild(label);
      item.appendChild(toggleWrap);
      presetsList.appendChild(item);
    }
  }

  function renderCustomDomains() {
    customDomainsList.innerHTML = '';
    if (currentConfig.customDomains.length === 0) {
      customDomainsList.innerHTML = '<div style="font-size: 11px; color: var(--text-muted); padding: 4px 0;">No custom domains added.</div>';
      return;
    }

    currentConfig.customDomains.forEach((domainItem, index) => {
      const item = document.createElement('div');
      item.className = 'custom-domain-item';

      const name = document.createElement('span');
      name.textContent = typeof domainItem === 'string' ? domainItem : domainItem.domain;

      const delBtn = document.createElement('button');
      delBtn.className = 'btn-delete-custom';
      delBtn.title = 'Remove domain';
      delBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      `;

      delBtn.addEventListener('click', async () => {
        currentConfig.customDomains.splice(index, 1);
        await saveConfig();
        renderCustomDomains();
      });

      item.appendChild(name);
      item.appendChild(delBtn);
      customDomainsList.appendChild(item);
    });
  }

  formAddCustom.addEventListener('submit', async (e) => {
    e.preventDefault();
    let val = inputCustomDomain.value.trim().toLowerCase();
    if (!val) return;

    // Strip http/https/slashes if user entered a full URL
    try {
      if (val.startsWith('http://') || val.startsWith('https://')) {
        val = new URL(val).hostname;
      } else if (val.includes('/')) {
        val = val.split('/')[0];
      }
    } catch {
      // Keep as is
    }

    const exists = currentConfig.customDomains.some((c) => {
      const d = typeof c === 'string' ? c : c.domain;
      return d.toLowerCase() === val;
    });

    if (!exists) {
      currentConfig.customDomains.push({ domain: val, enabled: true });
      await saveConfig();
      renderCustomDomains();
      inputCustomDomain.value = '';
      setStatus(`Added domain: ${val}`);
    } else {
      setStatus('Domain already exists');
    }
  });

  async function saveConfig() {
    try {
      await chrome.runtime.sendMessage({
        action: 'SAVE_CONFIG',
        presets: currentConfig.presets,
        customDomains: currentConfig.customDomains
      });
      setStatus('Settings saved');
    } catch (err) {
      console.error('Error saving config:', err);
      setStatus('Failed to save settings', true);
    }
  }

  // Initial load
  await refreshTabs();
});
