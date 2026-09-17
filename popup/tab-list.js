// Tab list and group accordion view components (XSS Safe)

import {
  clearElement,
  showPlaceholder,
  createPopoutSvgIcon,
  createChevronSvgIcon
} from './dom.js';
import {
  getActiveDomains,
  groupTabsByApp
} from '../utils/matcher.js';

/**
 * Filter tabs by search query (case-insensitive title and URL/domain match)
 * @param {Array<chrome.tabs.Tab>} tabs
 * @param {string} query
 * @returns {Array<chrome.tabs.Tab>}
 */
export function filterTabsByQuery(tabs, query) {
  if (!query) return tabs;
  const q = query.toLowerCase();
  return tabs.filter((t) => {
    const title = (t.title || '').toLowerCase();
    const url = (t.url || '').toLowerCase();
    return title.includes(q) || url.includes(q);
  });
}

/**
 * Update selection counter & checkboxes across entire list
 */
export function updateSelectionUI({
  tabsList,
  selectionCountText,
  chkSelectAll,
  btnMoveSelected,
  btnMoveText,
  currentTabs,
  searchQuery,
  selectedTabIds,
  currentGrouping
}) {
  const filtered = filterTabsByQuery(currentTabs, searchQuery);
  const totalVisible = filtered.length;
  const visibleSelectedCount = filtered.filter((t) => selectedTabIds.has(t.id)).length;
  const totalSelected = selectedTabIds.size;

  if (selectionCountText) {
    selectionCountText.textContent = searchQuery
      ? `${visibleSelectedCount} of ${totalVisible} match (${totalSelected} total)`
      : `${totalSelected} of ${totalVisible} selected`;
  }

  if (chkSelectAll) {
    chkSelectAll.checked = totalVisible > 0 && visibleSelectedCount === totalVisible;
    chkSelectAll.indeterminate = visibleSelectedCount > 0 && visibleSelectedCount < totalVisible;
  }

  if (btnMoveSelected && btnMoveText) {
    if (totalSelected === 0) {
      btnMoveSelected.disabled = true;
      btnMoveText.textContent = 'Open Selected in App (0)';
    } else {
      btnMoveSelected.disabled = false;
      btnMoveText.textContent = `Open Selected in App (${totalSelected})`;
    }
  }

  // Sync group-level checkboxes in accordion cards
  if (currentGrouping === 'grouped' && tabsList) {
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

/**
 * Update the Expand / Collapse All button text state
 */
export function updateExpandButtonState({ tabsList, btnToggleExpand, currentGrouping, expandBtnText }) {
  if (!btnToggleExpand || !expandBtnText || currentGrouping !== 'grouped' || !tabsList) return;
  const groupCards = tabsList.querySelectorAll('.app-group-card');
  if (groupCards.length === 0) return;
  const allCollapsed = Array.from(groupCards).every((c) => c.classList.contains('collapsed'));
  expandBtnText.textContent = allCollapsed ? 'Expand All' : 'Collapse All';
}

/**
 * Create tab row DOM element safely without innerHTML
 * @param {chrome.tabs.Tab} tab
 * @param {Object} callbacks
 * @returns {HTMLElement}
 */
export function createTabItemElement(tab, { selectedTabIds, onSelectionChange, onMoveSingleTab }) {
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
    if (onSelectionChange) onSelectionChange();
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
    if (onMoveSingleTab) {
      await onMoveSingleTab(tab, card, popBtn);
    }
  });

  card.appendChild(chkWrap);
  card.appendChild(info);
  card.appendChild(popBtn);
  return card;
}

/**
 * Create an application group accordion card safely without innerHTML
 * @param {Object} group
 * @param {Object} callbacks
 * @returns {HTMLElement}
 */
export function createGroupElement(group, {
  collapsedGroups,
  selectedTabIds,
  onSelectionChange,
  onToggleCollapse,
  onMoveGroup,
  onMoveSingleTab
}) {
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
    if (onSelectionChange) onSelectionChange();
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
    if (onMoveGroup) {
      await onMoveGroup(group);
    }
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
    if (onToggleCollapse) onToggleCollapse();
  });

  // Group Body (Tab rows)
  const body = document.createElement('div');
  body.className = 'app-group-body';

  for (const tab of group.tabs) {
    const tabCard = createTabItemElement(tab, {
      selectedTabIds,
      onSelectionChange,
      onMoveSingleTab
    });
    body.appendChild(tabCard);
  }

  card.appendChild(header);
  card.appendChild(body);
  return card;
}

/**
 * Render tabs either grouped by app or as a flat list
 */
export function renderTabList({
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
  onSelectionChange,
  onToggleCollapse,
  onMoveGroup,
  onMoveSingleTab,
  updateSelectionUIFn,
  updateExpandButtonStateFn
}) {
  if (!tabsList) return;
  clearElement(tabsList);

  const filtered = filterTabsByQuery(currentTabs, searchQuery);
  if (tabCount) tabCount.textContent = String(filtered.length);

  if (currentTabs.length === 0) {
    showPlaceholder(tabsList, 'No matching app tabs found.', 'empty-state');
    if (updateSelectionUIFn) updateSelectionUIFn();
    if (btnToggleExpand) btnToggleExpand.style.display = 'none';
    return;
  }

  if (filtered.length === 0) {
    showPlaceholder(tabsList, `No tabs matching "${searchQuery}"`, 'empty-state');
    if (updateSelectionUIFn) updateSelectionUIFn();
    if (btnToggleExpand) btnToggleExpand.style.display = 'none';
    return;
  }

  if (btnToggleExpand) {
    btnToggleExpand.style.display = currentGrouping === 'grouped' ? 'block' : 'none';
  }

  const fragment = document.createDocumentFragment();

  if (currentGrouping === 'grouped') {
    const activeDomains = getActiveDomains(
      currentConfig.presets,
      currentConfig.customDomains,
      installedApps,
      currentConfig.disabledInstalledAppIds
    );
    const groups = groupTabsByApp(filtered, activeDomains, currentConfig.presets, installedApps);

    for (const group of groups) {
      const groupCard = createGroupElement(group, {
        collapsedGroups,
        selectedTabIds,
        onSelectionChange,
        onToggleCollapse,
        onMoveGroup,
        onMoveSingleTab
      });
      fragment.appendChild(groupCard);
    }
  } else {
    for (const tab of filtered) {
      const item = createTabItemElement(tab, {
        selectedTabIds,
        onSelectionChange,
        onMoveSingleTab
      });
      fragment.appendChild(item);
    }
  }

  tabsList.appendChild(fragment);
  if (updateSelectionUIFn) updateSelectionUIFn();
  if (updateExpandButtonStateFn) updateExpandButtonStateFn();
}
