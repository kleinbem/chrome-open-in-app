// Open in App - Popup & Full Tab Logic v1.4.1 (Hardened against XSS)

import {
  normalizeDomain,
  isSafeDomain,
  groupTabsByApp,
  getActiveDomains,
  SUGGESTED_APP_TEMPLATES,
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

  // Settings view elements
  const toolbarModePopup = document.getElementById('toolbar-mode-popup');
  const toolbarModeTab = document.getElementById('toolbar-mode-tab');
  const groupingModeGrouped = document.getElementById('grouping-mode-grouped');
  const groupingModeFlat = document.getElementById('grouping-mode-flat');
  const modePopupRadio = document.getElementById('mode-popup');
  const modeNormalRadio = document.getElementById('mode-normal');
  const chkIgnorePinned = document.getElementById('chk-ignore-pinned');
  const chkReuseExisting = document.getElementById('chk-reuse-existing');
  const installedPwasList = document.getElementById('installed-pwas-list');
  const btnRescanPwas = document.getElementById('btn-rescan-pwas');
  const activePresetsSection = document.getElementById('active-presets-section');
  const presetsList = document.getElementById('presets-list');
  const catalogPresetsList = document.getElementById('catalog-presets-list');
  const customDomainsList = document.getElementById('custom-domains-list');
  const formAddCustom = document.getElementById('form-add-custom');
  const inputCustomDomain = document.getElementById('input-custom-domain');
  const statusMessage = document.getElementById('status-message');
  const versionLabel = document.getElementById('version-label');

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
   * Safe DOM Helper: Creates SVG Chevron icon for accordion
   */
  function createChevronSvgIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.classList.add('chevron-icon');

    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', '6 9 12 15 18 9');
    svg.appendChild(polyline);
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
   * Filter tabs by search query (case-insensitive title and URL/domain match)
   */
  function filterTabsByQuery(tabs, query) {
    if (!query) return tabs;
    const q = query.toLowerCase();
    return tabs.filter((t) => {
      const title = (t.title || '').toLowerCase();
      const url = (t.url || '').toLowerCase();
      return title.includes(q) || url.includes(q);
    });
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
   * Search input filtering
   */
  tabSearchInput.addEventListener('input', () => {
    searchQuery = tabSearchInput.value.trim().toLowerCase();
    btnClearSearch.style.display = searchQuery ? 'block' : 'none';
    renderTabList();
  });

  btnClearSearch.addEventListener('click', () => {
    tabSearchInput.value = '';
    searchQuery = '';
    btnClearSearch.style.display = 'none';
    renderTabList();
  });

  /**
   * View grouping toggle (Grouped vs Flat)
   */
  btnToggleGrouping.addEventListener('click', () => {
    currentGrouping = currentGrouping === 'grouped' ? 'flat' : 'grouped';
    groupingBtnText.textContent = currentGrouping === 'grouped' ? 'Grouped' : 'Flat';
    btnToggleGrouping.classList.toggle('active', currentGrouping === 'grouped');
    renderTabList();
  });

  /**
   * Expand / Collapse all groups toggle
   */
  btnToggleExpand.addEventListener('click', () => {
    const groupCards = tabsList.querySelectorAll('.app-group-card');
    if (groupCards.length === 0) return;

    const hasExpanded = Array.from(groupCards).some((c) => !c.classList.contains('collapsed'));

    if (hasExpanded) {
      groupCards.forEach((c) => c.classList.add('collapsed'));
      const activeDomains = getActiveDomains(currentConfig.presets, currentConfig.customDomains);
      const groups = groupTabsByApp(currentTabs, activeDomains, currentConfig.presets);
      groups.forEach((g) => collapsedGroups.add(g.key));
      expandBtnText.textContent = 'Expand All';
    } else {
      groupCards.forEach((c) => c.classList.remove('collapsed'));
      collapsedGroups.clear();
      expandBtnText.textContent = 'Collapse All';
    }
  });

  function updateExpandButtonState() {
    if (!btnToggleExpand || currentGrouping !== 'grouped') return;
    const groupCards = tabsList.querySelectorAll('.app-group-card');
    if (groupCards.length === 0) return;
    const allCollapsed = Array.from(groupCards).every((c) => c.classList.contains('collapsed'));
    expandBtnText.textContent = allCollapsed ? 'Expand All' : 'Collapse All';
  }

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
   * Update selection counter & checkboxes across entire list
   */
  function updateSelectionUI() {
    const filtered = filterTabsByQuery(currentTabs, searchQuery);
    const totalVisible = filtered.length;
    const visibleSelectedCount = filtered.filter((t) => selectedTabIds.has(t.id)).length;
    const totalSelected = selectedTabIds.size;

    selectionCountText.textContent = searchQuery
      ? `${visibleSelectedCount} of ${totalVisible} match (${totalSelected} total)`
      : `${totalSelected} of ${totalVisible} selected`;

    chkSelectAll.checked = totalVisible > 0 && visibleSelectedCount === totalVisible;
    chkSelectAll.indeterminate = visibleSelectedCount > 0 && visibleSelectedCount < totalVisible;

    if (totalSelected === 0) {
      btnMoveSelected.disabled = true;
      btnMoveText.textContent = 'Open Selected in App (0)';
    } else {
      btnMoveSelected.disabled = false;
      btnMoveText.textContent = `Open Selected in App (${totalSelected})`;
    }

    // Sync group-level checkboxes in accordion cards
    if (currentGrouping === 'grouped') {
      const groupCards = tabsList.querySelectorAll('.app-group-card');
      groupCards.forEach((card) => {
        const groupChk = card.querySelector('.group-chk');
        if (!groupChk) return;
        const bodyBoxes = card.querySelectorAll('.app-group-body .tab-select-chk input');
        let checkedCount = 0;
        bodyBoxes.forEach((cb) => {
          if (cb.checked) checkedCount++;
        });
        groupChk.checked = bodyBoxes.length > 0 && checkedCount === bodyBoxes.length;
        groupChk.indeterminate = checkedCount > 0 && checkedCount < bodyBoxes.length;
      });
    }
  }

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
      selectedTabIds.clear();
      currentTabs.forEach((t) => selectedTabIds.add(t.id));

      renderTabList();
      setStatus(`Detected ${currentTabs.length} matching tab${currentTabs.length > 1 ? 's' : ''}`);
    } catch (err) {
      console.error('Error refreshing tabs:', err);
      showPlaceholder(tabsList, 'Error scanning tabs', 'empty-state');
      setStatus('Error scanning tabs', true);
    }
  }

  /**
   * Render tabs either grouped by app or as a flat list
   */
  function renderTabList() {
    clearElement(tabsList);

    const filtered = filterTabsByQuery(currentTabs, searchQuery);
    tabCount.textContent = String(filtered.length);

    if (currentTabs.length === 0) {
      showPlaceholder(tabsList, 'No matching app tabs found.', 'empty-state');
      updateSelectionUI();
      if (btnToggleExpand) btnToggleExpand.style.display = 'none';
      return;
    }

    if (filtered.length === 0) {
      showPlaceholder(tabsList, `No tabs matching "${searchQuery}"`, 'empty-state');
      updateSelectionUI();
      if (btnToggleExpand) btnToggleExpand.style.display = 'none';
      return;
    }

    if (btnToggleExpand) {
      btnToggleExpand.style.display = currentGrouping === 'grouped' ? 'block' : 'none';
    }

    const fragment = document.createDocumentFragment();

    if (currentGrouping === 'grouped') {
      const activeDomains = getActiveDomains(currentConfig.presets, currentConfig.customDomains);
      const groups = groupTabsByApp(filtered, activeDomains, currentConfig.presets);

      for (const group of groups) {
        const groupCard = createGroupElement(group);
        fragment.appendChild(groupCard);
      }
    } else {
      for (const tab of filtered) {
        const item = createTabItemElement(tab);
        fragment.appendChild(item);
      }
    }

    tabsList.appendChild(fragment);
    updateSelectionUI();
    updateExpandButtonState();
  }

  /**
   * Create an application group accordion card safely without innerHTML
   */
  function createGroupElement(group) {
    const card = document.createElement('div');
    card.className = 'app-group-card';
    if (collapsedGroups.has(group.key)) {
      card.classList.add('collapsed');
    }

    const header = document.createElement('div');
    header.className = 'app-group-header';

    // Left container
    const left = document.createElement('div');
    left.className = 'app-group-left';

    // Group-level checkbox
    const chkWrap = document.createElement('label');
    chkWrap.className = 'tab-select-chk checkbox-container';
    const groupChk = document.createElement('input');
    groupChk.type = 'checkbox';
    groupChk.className = 'group-chk';

    const groupTabIds = group.tabs.map((t) => t.id);
    const selectedInGroup = groupTabIds.filter((id) => selectedTabIds.has(id)).length;
    groupChk.checked = groupTabIds.length > 0 && selectedInGroup === groupTabIds.length;
    groupChk.indeterminate = selectedInGroup > 0 && selectedInGroup < groupTabIds.length;

    groupChk.addEventListener('change', (e) => {
      e.stopPropagation();
      if (groupChk.checked) {
        groupTabIds.forEach((id) => selectedTabIds.add(id));
      } else {
        groupTabIds.forEach((id) => selectedTabIds.delete(id));
      }
      const bodyCheckboxes = card.querySelectorAll('.app-group-body .tab-select-chk input');
      bodyCheckboxes.forEach((cb) => {
        cb.checked = groupChk.checked;
      });
      updateSelectionUI();
    });

    chkWrap.appendChild(groupChk);
    left.appendChild(chkWrap);

    // Group icon
    const icon = document.createElement('img');
    icon.className = 'app-group-icon';
    icon.src = group.icon || '../icons/icon-16.png';
    icon.onerror = () => {
      icon.src = '../icons/icon-16.png';
    };
    left.appendChild(icon);

    // Group Info (Name & Domain)
    const info = document.createElement('div');
    info.className = 'app-group-info';

    const title = document.createElement('span');
    title.className = 'app-group-title';
    title.textContent = group.name;

    const domain = document.createElement('span');
    domain.className = 'app-group-domain';
    domain.textContent = group.domain;

    info.appendChild(title);
    info.appendChild(domain);
    left.appendChild(info);

    // Tab count badge
    const badge = document.createElement('span');
    badge.className = 'app-group-badge';
    badge.textContent = `${group.tabs.length} tab${group.tabs.length > 1 ? 's' : ''}`;
    left.appendChild(badge);

    header.appendChild(left);

    // Right container
    const right = document.createElement('div');
    right.className = 'app-group-right';

    // Quick "Open in App" button for this group
    const moveBtn = document.createElement('button');
    moveBtn.className = 'btn-group-move';
    moveBtn.title = `Open all ${group.tabs.length} tabs of ${group.name} in app windows`;
    moveBtn.appendChild(createPopoutSvgIcon());
    const moveBtnText = document.createElement('span');
    moveBtnText.textContent = 'Open Group';
    moveBtn.appendChild(moveBtnText);

    moveBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await moveTabsBatch(group.tabs.map((t) => t.id), group.name);
    });
    right.appendChild(moveBtn);

    // Chevron collapse/expand indicator
    const chevron = createChevronSvgIcon();
    right.appendChild(chevron);

    header.appendChild(right);

    // Header click toggles collapse
    header.addEventListener('click', (e) => {
      if (e.target.closest('.checkbox-container') || e.target.closest('.btn-group-move')) {
        return;
      }
      card.classList.toggle('collapsed');
      if (card.classList.contains('collapsed')) {
        collapsedGroups.add(group.key);
      } else {
        collapsedGroups.delete(group.key);
      }
      updateExpandButtonState();
    });

    // Group Body (Tab rows)
    const body = document.createElement('div');
    body.className = 'app-group-body';

    for (const tab of group.tabs) {
      const tabCard = createTabItemElement(tab);
      body.appendChild(tabCard);
    }

    card.appendChild(header);
    card.appendChild(body);
    return card;
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
        const groupBody = card.closest('.app-group-body');
        card.remove();
        selectedTabIds.delete(tab.id);
        currentTabs = currentTabs.filter((t) => t.id !== tab.id);

        if (groupBody && groupBody.children.length === 0) {
          const groupCard = groupBody.closest('.app-group-card');
          if (groupCard) groupCard.remove();
        }

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
   * Reusable batch open helper
   */
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
    setStatus(`Opening ${labelPrefix}${tabIdsToMove.length} tabs${labelSuffix} in app...`);

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
  }

  // Master action button
  btnMoveSelected.addEventListener('click', async () => {
    const tabIdsToMove = Array.from(selectedTabIds);
    await moveTabsBatch(tabIdsToMove);
  });

  /**
   * Settings Loader
   */
  async function loadSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'GET_CONFIG' });
      if (response && response.success) {
        currentConfig = {
          presets: response.presets || DEFAULT_CONFIG.presets,
          disabledInstalledAppIds: response.disabledInstalledAppIds || [],
          customDomains: response.customDomains || [],
          windowMode: response.windowMode || DEFAULT_CONFIG.windowMode,
          windowScope: response.windowScope || DEFAULT_CONFIG.windowScope,
          ignorePinnedTabs: response.ignorePinnedTabs !== false,
          reuseExistingAppWindow: response.reuseExistingAppWindow !== false,
          toolbarAction: response.toolbarAction || DEFAULT_CONFIG.toolbarAction,
          defaultGrouping: response.defaultGrouping || DEFAULT_CONFIG.defaultGrouping
        };

        // Fetch installed apps from system
        try {
          const appRes = await chrome.runtime.sendMessage({ action: 'GET_INSTALLED_APPS' });
          if (appRes?.success && Array.isArray(appRes.apps)) {
            installedApps = appRes.apps;
          }
        } catch {}

        if (toolbarModePopup && toolbarModeTab) {
          if (currentConfig.toolbarAction === 'tab') {
            toolbarModeTab.checked = true;
          } else {
            toolbarModePopup.checked = true;
          }
        }

        if (groupingModeGrouped && groupingModeFlat) {
          if (currentConfig.defaultGrouping === 'flat') {
            groupingModeFlat.checked = true;
          } else {
            groupingModeGrouped.checked = true;
          }
        }

        if (currentConfig.windowMode === 'normal') {
          modeNormalRadio.checked = true;
          windowModeBadge.textContent = 'Normal Window';
        } else {
          modePopupRadio.checked = true;
          windowModeBadge.textContent = 'App Mode';
        }

        chkIgnorePinned.checked = currentConfig.ignorePinnedTabs;
        if (chkReuseExisting) chkReuseExisting.checked = currentConfig.reuseExistingAppWindow;

        renderInstalledPWAs();
        renderActivePresets();
        renderCatalogPresets();
        renderCustomDomains();
      }
    } catch (err) {
      console.error('Error loading settings:', err);
      setStatus('Failed to load settings', true);
    }
  }

  // Toolbar action setting changes
  if (toolbarModePopup) {
    toolbarModePopup.addEventListener('change', async () => {
      if (toolbarModePopup.checked) {
        currentConfig.toolbarAction = 'popup';
        await saveConfig({ toolbarAction: 'popup' });
      }
    });
  }

  if (toolbarModeTab) {
    toolbarModeTab.addEventListener('change', async () => {
      if (toolbarModeTab.checked) {
        currentConfig.toolbarAction = 'tab';
        await saveConfig({ toolbarAction: 'tab' });
      }
    });
  }

  // Default grouping setting changes
  if (groupingModeGrouped) {
    groupingModeGrouped.addEventListener('change', async () => {
      if (groupingModeGrouped.checked) {
        currentConfig.defaultGrouping = 'grouped';
        currentGrouping = 'grouped';
        groupingBtnText.textContent = 'Grouped';
        btnToggleGrouping.classList.add('active');
        await saveConfig({ defaultGrouping: 'grouped' });
      }
    });
  }

  if (groupingModeFlat) {
    groupingModeFlat.addEventListener('change', async () => {
      if (groupingModeFlat.checked) {
        currentConfig.defaultGrouping = 'flat';
        currentGrouping = 'flat';
        groupingBtnText.textContent = 'Flat';
        btnToggleGrouping.classList.remove('active');
        await saveConfig({ defaultGrouping: 'flat' });
      }
    });
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

  function renderInstalledPWAs() {
    if (!installedPwasList) return;
    clearElement(installedPwasList);

    if (!Array.isArray(installedApps) || installedApps.length === 0) {
      const empty = document.createElement('div');
      empty.style.fontSize = '11px';
      empty.style.color = 'var(--text-muted)';
      empty.style.gridColumn = '1 / -1';
      empty.style.padding = '6px 0';
      empty.textContent = 'No desktop PWAs detected on this machine. You can install any web app in Chrome or pick from the popular catalog below.';
      installedPwasList.appendChild(empty);
      return;
    }

    const disabledSet = new Set(currentConfig.disabledInstalledAppIds || []);

    for (const app of installedApps) {
      const item = document.createElement('div');
      item.className = 'preset-item';

      const label = document.createElement('div');
      label.className = 'preset-label';

      const name = document.createElement('span');
      name.className = 'preset-name';
      name.textContent = app.name || 'Unnamed App';

      const domain = document.createElement('span');
      domain.className = 'preset-domain';
      domain.textContent = app.domains?.[0] || 'Desktop App';

      label.appendChild(name);
      label.appendChild(domain);

      const toggleWrap = document.createElement('label');
      toggleWrap.className = 'switch';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !disabledSet.has(app.id);

      const slider = document.createElement('span');
      slider.className = 'slider';

      input.addEventListener('change', async () => {
        const currentDisabled = new Set(currentConfig.disabledInstalledAppIds || []);
        if (input.checked) {
          currentDisabled.delete(app.id);
        } else {
          currentDisabled.add(app.id);
        }
        currentConfig.disabledInstalledAppIds = Array.from(currentDisabled);
        await saveConfig({ disabledInstalledAppIds: currentConfig.disabledInstalledAppIds });
        renderCatalogPresets();
      });

      toggleWrap.appendChild(input);
      toggleWrap.appendChild(slider);

      item.appendChild(label);
      item.appendChild(toggleWrap);
      installedPwasList.appendChild(item);
    }
  }

  function renderActivePresets() {
    if (!presetsList) return;
    clearElement(presetsList);

    const activeList = currentConfig.presets || [];
    if (activePresetsSection) {
      activePresetsSection.style.display = activeList.length > 0 ? 'block' : 'none';
    }

    for (let index = 0; index < activeList.length; index++) {
      const preset = activeList[index];
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

      const delBtn = document.createElement('button');
      delBtn.className = 'btn-delete-custom';
      delBtn.title = 'Remove preset';
      delBtn.appendChild(createTrashSvgIcon());

      delBtn.addEventListener('click', async () => {
        activeList.splice(index, 1);
        currentConfig.presets = activeList;
        await saveConfig({ presets: currentConfig.presets });
        renderActivePresets();
        renderCatalogPresets();
      });

      item.appendChild(label);
      item.appendChild(delBtn);
      presetsList.appendChild(item);
    }
  }

  function renderCatalogPresets() {
    if (!catalogPresetsList) return;
    clearElement(catalogPresetsList);

    const activeDomains = new Set((currentConfig.presets || []).map(p => p.domain?.toLowerCase()));
    const installedDomains = new Set();
    if (Array.isArray(installedApps)) {
      for (const app of installedApps) {
        if (Array.isArray(app.domains)) {
          for (const d of app.domains) installedDomains.add(d.toLowerCase());
        }
      }
    }

    for (const template of SUGGESTED_APP_TEMPLATES) {
      const card = document.createElement('div');
      card.className = 'catalog-card';

      const info = document.createElement('div');
      info.className = 'catalog-info';

      const name = document.createElement('span');
      name.className = 'catalog-name';
      name.textContent = template.name;

      const domain = document.createElement('span');
      domain.className = 'catalog-domain';
      domain.textContent = template.domain;

      info.appendChild(name);
      info.appendChild(domain);

      const isInstalled = installedDomains.has(template.domain.toLowerCase());
      const isPreset = activeDomains.has(template.domain.toLowerCase());

      const btn = document.createElement('button');
      if (isInstalled) {
        btn.className = 'btn-catalog-added';
        btn.textContent = 'Installed';
        btn.title = 'Already installed on this computer as desktop PWA';
      } else if (isPreset) {
        btn.className = 'btn-catalog-added';
        btn.textContent = 'Active';
        btn.title = 'Already active in presets';
      } else {
        btn.className = 'btn-catalog-add';
        btn.textContent = '+ Add';
        btn.title = `Add ${template.name} (${template.domain})`;
        btn.addEventListener('click', async () => {
          if (!Array.isArray(currentConfig.presets)) currentConfig.presets = [];
          currentConfig.presets.push({
            id: template.id,
            name: template.name,
            domain: template.domain,
            enabled: true
          });
          await saveConfig({ presets: currentConfig.presets });
          renderActivePresets();
          renderCatalogPresets();
        });
      }

      card.appendChild(info);
      card.appendChild(btn);
      catalogPresetsList.appendChild(card);
    }
  }

  if (btnRescanPwas) {
    btnRescanPwas.addEventListener('click', async () => {
      btnRescanPwas.disabled = true;
      btnRescanPwas.textContent = 'Scanning...';
      try {
        const res = await chrome.runtime.sendMessage({ action: 'GET_INSTALLED_APPS', forceRefresh: true });
        if (res?.success && Array.isArray(res.apps)) {
          installedApps = res.apps;
          renderInstalledPWAs();
          renderCatalogPresets();
        }
      } catch (err) {
        console.warn('Rescan failed:', err);
      } finally {
        btnRescanPwas.disabled = false;
        btnRescanPwas.textContent = 'Scan System';
      }
    });
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
      presets: initialConfig.presets || DEFAULT_CONFIG.presets,
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

    chkIgnorePinned.checked = currentConfig.ignorePinnedTabs;
    if (chkReuseExisting) chkReuseExisting.checked = currentConfig.reuseExistingAppWindow;
  }

  async function updateDiagnostics() {
    const diagWinCount = document.getElementById('diag-windows-count');
    const diagWinTypes = document.getElementById('diag-window-types');
    const diagAppsCount = document.getElementById('diag-apps-count');
    if (!diagWinCount || !diagWinTypes || !diagAppsCount) return;

    try {
      const windows = await chrome.windows.getAll({
        populate: true,
        windowTypes: ['normal', 'popup', 'app']
      });
      diagWinCount.textContent = `${windows.length} window${windows.length === 1 ? '' : 's'}`;

      const typeCounts = {};
      for (const w of windows) {
        typeCounts[w.type] = (typeCounts[w.type] || 0) + 1;
      }
      diagWinTypes.textContent = Object.entries(typeCounts)
        .map(([type, count]) => `${count} ${type}`)
        .join(', ') || 'None';

      if (typeof chrome.management !== 'undefined' && chrome.management.getAll) {
        const apps = await chrome.management.getAll();
        const appItems = apps.filter((a) => a.type === 'hosted_app' || a.type === 'packaged_app' || Boolean(a.appLaunchUrl));
        diagAppsCount.textContent = appItems.length > 0
          ? `${appItems.length} app(s) (${appItems.map((a) => a.name).slice(0, 2).join(', ')})`
          : '0 apps (Decoupled in Chromium 124+)';
      } else {
        diagAppsCount.textContent = 'API not available';
      }
    } catch (err) {
      diagWinCount.textContent = 'Query failed';
      console.warn('Diagnostics error:', err);
    }
  }

  const manifestVersion = chrome.runtime.getManifest().version;
  if (versionLabel) {
    versionLabel.textContent = `v${manifestVersion}`;
  }
  console.log(`[Open in App v${manifestVersion}] Popup UI initialized`);

  await refreshTabs();
  await updateDiagnostics();
});
