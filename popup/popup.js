// Open in App - Popup & Full Tab Controller v1.5.0 (Hardened against XSS)

import {
  showPlaceholder,
  setStatus
} from './dom.js';
import {
  filterTabsByQuery,
  renderTabList,
  updateSelectionUI,
  updateExpandButtonState
} from './tab-list.js';
import {
  bindSettingsEvents,
  loadSettings,
  updateDiagnostics
} from './settings-view.js';
import {
  DEFAULT_CONFIG
} from '../utils/matcher.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Navigation elements
  const btnOpenFullTab = document.getElementById('btn-open-full-tab');
  const navTabsBtn = document.getElementById('nav-tabs-btn');
  const navSettingsBtn = document.getElementById('nav-settings-btn');
  const viewTabs = document.getElementById('view-tabs');
  const viewSettings = document.getElementById('view-settings');
  const windowModeBadge = document.getElementById('window-mode-badge');

  // Scope buttons
  const scopeCurrentBtn = document.getElementById('scope-current-btn');
  const scopeAllBtn = document.getElementById('scope-all-btn');

  // Search & grouping controls
  const tabSearchInput = document.getElementById('tab-search-input');
  const btnClearSearch = document.getElementById('btn-clear-search');
  const btnToggleGrouping = document.getElementById('btn-toggle-grouping');
  const groupingBtnText = document.getElementById('grouping-btn-text');
  const btnToggleExpand = document.getElementById('btn-toggle-expand');
  const expandBtnText = document.getElementById('expand-btn-text');

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

  // Status & Version elements
  const statusMessage = document.getElementById('status-message');
  const versionLabel = document.getElementById('version-label');

  // Settings view elements object
  const settingsElements = {
    toolbarModePopup: document.getElementById('toolbar-mode-popup'),
    toolbarModeTab: document.getElementById('toolbar-mode-tab'),
    groupingModeGrouped: document.getElementById('grouping-mode-grouped'),
    groupingModeFlat: document.getElementById('grouping-mode-flat'),
    modePopupRadio: document.getElementById('mode-popup'),
    modeNormalRadio: document.getElementById('mode-normal'),
    windowModeBadge,
    chkIgnorePinned: document.getElementById('chk-ignore-pinned'),
    chkReuseExisting: document.getElementById('chk-reuse-existing'),
    installedPwasList: document.getElementById('installed-pwas-list'),
    btnRescanPwas: document.getElementById('btn-rescan-pwas'),
    customDomainsList: document.getElementById('custom-domains-list'),
    formAddCustom: document.getElementById('form-add-custom'),
    inputCustomDomain: document.getElementById('input-custom-domain'),
    statusMessage
  };

  // State
  let currentConfig = {
    presets: DEFAULT_CONFIG.presets,
    disabledInstalledAppIds: DEFAULT_CONFIG.disabledInstalledAppIds,
    customDomains: [],
    windowMode: DEFAULT_CONFIG.windowMode,
    windowScope: DEFAULT_CONFIG.windowScope,
    ignorePinnedTabs: DEFAULT_CONFIG.ignorePinnedTabs,
    reuseExistingAppWindow: DEFAULT_CONFIG.reuseExistingAppWindow,
    toolbarAction: DEFAULT_CONFIG.toolbarAction,
    defaultGrouping: DEFAULT_CONFIG.defaultGrouping
  };

  let installedApps = [];
  let currentGrouping = 'grouped';
  let searchQuery = '';
  const collapsedGroups = new Set();
  let currentTabs = [];
  const selectedTabIds = new Set();

  // Detect Full Tab Mode via URL query or window dimensions
  const urlParams = new URLSearchParams(window.location.search);
  const isFullTabMode = urlParams.get('mode') === 'tab' || window.innerWidth > 500;
  if (isFullTabMode) {
    document.body.classList.add('full-tab-mode');
    document.title = 'Open in App - Tab Manager';
  }

  // Open Full Tab button
  if (btnOpenFullTab) {
    btnOpenFullTab.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html?mode=tab') });
      window.close();
    });
  }

  function syncSelectionUI() {
    updateSelectionUI({
      tabsList,
      selectionCountText,
      chkSelectAll,
      btnMoveSelected,
      btnMoveText,
      currentTabs,
      searchQuery,
      selectedTabIds,
      currentGrouping
    });
  }

  function syncExpandButtonState() {
    updateExpandButtonState({
      tabsList,
      btnToggleExpand,
      currentGrouping,
      expandBtnText
    });
  }

  function triggerRenderTabList() {
    renderTabList({
      tabsList,
      tabCount,
      currentTabs,
      searchQuery,
      currentGrouping,
      collapsedGroups,
      selectedTabIds,
      currentConfig,
      installedApps,
      btnToggleExpand,
      onSelectionChange: syncSelectionUI,
      onToggleCollapse: syncExpandButtonState,
      onMoveGroup: async (group) => {
        await moveTabsBatch(group.tabs.map((t) => t.id), group.name);
      },
      onMoveSingleTab: async (tab, card, popBtn) => {
        popBtn.disabled = true;
        try {
          await chrome.runtime.sendMessage({
            action: 'MOVE_SINGLE_TAB',
            tabId: tab.id,
            windowMode: currentConfig.windowMode
          });
          const groupBody = card.closest('.app-group-body');
          card.remove();
          selectedTabIds.delete(tab.id);
          currentTabs = currentTabs.filter((t) => t.id !== tab.id);

          if (groupBody && groupBody.children.length === 0) {
            const groupCard = groupBody.closest('.app-group-card');
            if (groupCard) groupCard.remove();
          }

          syncSelectionUI();
          setStatus(statusMessage, 'Opened in app window');
        } catch (err) {
          console.error('Failed to open tab in app:', err);
          popBtn.disabled = false;
          setStatus(statusMessage, 'Failed to open in app', true);
        }
      },
      updateSelectionUIFn: syncSelectionUI,
      updateExpandButtonStateFn: syncExpandButtonState
    });
  }

  // Navigation listeners
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
    loadSettingsData();
  });

  // Scope toggling (Current Window vs All Windows)
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

  // Search input filtering
  tabSearchInput.addEventListener('input', () => {
    searchQuery = tabSearchInput.value.trim().toLowerCase();
    btnClearSearch.style.display = searchQuery ? 'block' : 'none';
    triggerRenderTabList();
  });

  btnClearSearch.addEventListener('click', () => {
    tabSearchInput.value = '';
    searchQuery = '';
    btnClearSearch.style.display = 'none';
    triggerRenderTabList();
  });

  // View grouping toggle (Grouped vs Flat)
  btnToggleGrouping.addEventListener('click', () => {
    currentGrouping = currentGrouping === 'grouped' ? 'flat' : 'grouped';
    groupingBtnText.textContent = currentGrouping === 'grouped' ? 'Grouped' : 'Flat';
    btnToggleGrouping.classList.toggle('active', currentGrouping === 'grouped');
    triggerRenderTabList();
  });

  // Expand / Collapse all groups toggle
  btnToggleExpand.addEventListener('click', () => {
    const groupCards = tabsList.querySelectorAll('.app-group-card');
    if (groupCards.length === 0) return;

    const hasExpanded = Array.from(groupCards).some((c) => !c.classList.contains('collapsed'));

    if (hasExpanded) {
      groupCards.forEach((c) => c.classList.add('collapsed'));
      const activeGroups = tabsList.querySelectorAll('.app-group-card');
      activeGroups.forEach((card) => {
        const title = card.querySelector('.app-group-title')?.textContent;
        if (title) collapsedGroups.add(title);
      });
      expandBtnText.textContent = 'Expand All';
    } else {
      groupCards.forEach((c) => c.classList.remove('collapsed'));
      collapsedGroups.clear();
      expandBtnText.textContent = 'Collapse All';
    }
  });

  // Progress message listener
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'PROGRESS_UPDATE') {
      const { current, total } = msg;
      progressText.textContent = `Opening tab ${current} of ${total} in app...`;
      progressFraction.textContent = `${current} / ${total}`;
      const pct = Math.round((current / total) * 100);
      progressFill.style.width = `${pct}%`;
    }
  });

  // Master Select All checkbox
  chkSelectAll.addEventListener('change', () => {
    const filtered = filterTabsByQuery(currentTabs, searchQuery);
    if (chkSelectAll.checked) {
      filtered.forEach((t) => selectedTabIds.add(t.id));
    } else {
      filtered.forEach((t) => selectedTabIds.delete(t.id));
    }
    const checkboxes = tabsList.querySelectorAll('.tab-select-chk input');
    checkboxes.forEach((cb) => {
      cb.checked = chkSelectAll.checked;
    });
    syncSelectionUI();
  });

  // Refresh tabs from background worker
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
        setStatus(statusMessage, 'Failed to scan tabs', true);
        return;
      }

      currentTabs = response.tabs || [];
      selectedTabIds.clear();
      currentTabs.forEach((t) => selectedTabIds.add(t.id));

      triggerRenderTabList();
      setStatus(statusMessage, `Detected ${currentTabs.length} matching tab${currentTabs.length > 1 ? 's' : ''}`);
    } catch (err) {
      console.error('Error refreshing tabs:', err);
      showPlaceholder(tabsList, 'Error scanning tabs', 'empty-state');
      setStatus(statusMessage, 'Error scanning tabs', true);
    }
  }

  // Batch move helper
  async function moveTabsBatch(tabIdsToMove, label = '') {
    if (!Array.isArray(tabIdsToMove) || tabIdsToMove.length === 0) return;

    btnMoveSelected.disabled = true;
    btnRefresh.disabled = true;
    progressContainer.classList.add('active');
    const labelPrefix = label ? `${label} (` : '';
    const labelSuffix = label ? ')' : '';
    progressText.textContent = `Opening ${labelPrefix}${tabIdsToMove.length} tabs${labelSuffix} in app...`;
    progressFraction.textContent = `0 / ${tabIdsToMove.length}`;
    progressFill.style.width = '0%';
    setStatus(statusMessage, `Opening ${labelPrefix}${tabIdsToMove.length} tabs${labelSuffix} in app...`);

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

      setStatus(statusMessage, `Successfully opened ${count} of ${tabIdsToMove.length} tabs in app!`);
      await refreshTabs();
    } catch (err) {
      console.error('Error in batch open:', err);
      progressContainer.classList.remove('active');
      setStatus(statusMessage, 'Failed to open tabs in app', true);
      btnMoveSelected.disabled = false;
      btnRefresh.disabled = false;
    }
  }

  // Master action button
  btnMoveSelected.addEventListener('click', async () => {
    const tabIdsToMove = Array.from(selectedTabIds);
    await moveTabsBatch(tabIdsToMove);
  });

  async function saveConfig(updates) {
    try {
      await chrome.runtime.sendMessage({
        action: 'SAVE_CONFIG',
        ...updates
      });
      setStatus(statusMessage, 'Settings saved');
    } catch (err) {
      console.error('Error saving config:', err);
      setStatus(statusMessage, 'Failed to save settings', true);
    }
  }

  async function loadSettingsData() {
    await loadSettings({
      elements: settingsElements,
      getConfig: () => currentConfig,
      setConfig: (c) => {
        currentConfig = c;
      },
      getInstalledApps: () => installedApps,
      setInstalledApps: (a) => {
        installedApps = a;
      },
      saveConfigFn: saveConfig
    });
  }

  // Wire up Settings form and controls
  bindSettingsEvents({
    elements: settingsElements,
    getConfig: () => currentConfig,
    setInstalledApps: (a) => {
      installedApps = a;
    },
    saveConfig,
    onGroupingChange: (newGrouping) => {
      currentGrouping = newGrouping;
      groupingBtnText.textContent = newGrouping === 'grouped' ? 'Grouped' : 'Flat';
      btnToggleGrouping.classList.toggle('active', newGrouping === 'grouped');
    }
  });

  // Initialize
  const initialConfig = await chrome.runtime.sendMessage({ action: 'GET_CONFIG' });
  if (initialConfig?.success) {
    currentConfig = {
      presets: initialConfig.presets || DEFAULT_CONFIG.presets,
      disabledInstalledAppIds: initialConfig.disabledInstalledAppIds || [],
      customDomains: initialConfig.customDomains || [],
      windowMode: initialConfig.windowMode || DEFAULT_CONFIG.windowMode,
      windowScope: initialConfig.windowScope || DEFAULT_CONFIG.windowScope,
      ignorePinnedTabs: initialConfig.ignorePinnedTabs !== false,
      reuseExistingAppWindow: initialConfig.reuseExistingAppWindow !== false,
      toolbarAction: initialConfig.toolbarAction || DEFAULT_CONFIG.toolbarAction,
      defaultGrouping: initialConfig.defaultGrouping || DEFAULT_CONFIG.defaultGrouping
    };

    currentGrouping = currentConfig.defaultGrouping;
    if (groupingBtnText) {
      groupingBtnText.textContent = currentGrouping === 'grouped' ? 'Grouped' : 'Flat';
    }
    if (btnToggleGrouping) {
      btnToggleGrouping.classList.toggle('active', currentGrouping === 'grouped');
    }

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

    if (settingsElements.chkIgnorePinned) settingsElements.chkIgnorePinned.checked = currentConfig.ignorePinnedTabs;
    if (settingsElements.chkReuseExisting) settingsElements.chkReuseExisting.checked = currentConfig.reuseExistingAppWindow;
  }

  const manifestVersion = chrome.runtime.getManifest().version;
  if (versionLabel) {
    versionLabel.textContent = `v${manifestVersion}`;
  }
  console.log(`[Open in App v${manifestVersion}] Popup UI initialized`);

  await refreshTabs();
  await updateDiagnostics({
    diagWinCount: document.getElementById('diag-windows-count'),
    diagWinTypes: document.getElementById('diag-window-types'),
    diagAppsCount: document.getElementById('diag-apps-count')
  });
});
