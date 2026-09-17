// Settings and diagnostics view components (XSS Safe)

import { clearElement, createTrashSvgIcon, setStatus } from './dom.js';
import { normalizeDomain, isSafeDomain, DEFAULT_CONFIG } from '../utils/matcher.js';

/**
 * Render discovered desktop PWAs with toggle switches
 * @param {HTMLElement} container
 * @param {Array<Object>} installedApps
 * @param {Array<string>} disabledAppIds
 * @param {Function} onToggleApp
 */
export function renderInstalledPWAs(container, installedApps, disabledAppIds = [], onToggleApp) {
  if (!container) return;
  clearElement(container);

  if (!Array.isArray(installedApps) || installedApps.length === 0) {
    const empty = document.createElement('div');
    empty.style.fontSize = '11px';
    empty.style.color = 'var(--text-muted)';
    empty.style.gridColumn = '1 / -1';
    empty.style.padding = '6px 0';
    empty.textContent = 'No desktop PWAs detected on this machine. You can add any web app domain under Custom Domains below, or install PWAs directly in Chrome via the address bar.';
    container.appendChild(empty);
    return;
  }

  const disabledSet = new Set(disabledAppIds);

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
      if (onToggleApp) {
        await onToggleApp(app.id, input.checked);
      }
    });

    toggleWrap.appendChild(input);
    toggleWrap.appendChild(slider);

    item.appendChild(label);
    item.appendChild(toggleWrap);
    container.appendChild(item);
  }
}

/**
 * Render user-defined custom domains with delete buttons
 * @param {HTMLElement} container
 * @param {Array<string|Object>} customDomains
 * @param {Function} onRemoveDomain
 */
export function renderCustomDomains(container, customDomains = [], onRemoveDomain) {
  if (!container) return;
  clearElement(container);

  if (customDomains.length === 0) {
    const emptyNote = document.createElement('div');
    emptyNote.style.fontSize = '11px';
    emptyNote.style.color = 'var(--text-muted)';
    emptyNote.style.padding = '4px 0';
    emptyNote.textContent = 'No custom domains added.';
    container.appendChild(emptyNote);
    return;
  }

  customDomains.forEach((domainItem, index) => {
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
      if (onRemoveDomain) {
        await onRemoveDomain(index, domainStr);
      }
    });

    item.appendChild(name);
    item.appendChild(delBtn);
    container.appendChild(item);
  });
}

/**
 * Synchronize Settings form elements with config object
 */
export function syncSettingsForm(elements, config) {
  const {
    toolbarModePopup,
    toolbarModeTab,
    groupingModeGrouped,
    groupingModeFlat,
    modePopupRadio,
    modeNormalRadio,
    windowModeBadge,
    chkIgnorePinned,
    chkReuseExisting
  } = elements;

  if (toolbarModePopup && toolbarModeTab) {
    if (config.toolbarAction === 'tab') {
      toolbarModeTab.checked = true;
    } else {
      toolbarModePopup.checked = true;
    }
  }

  if (groupingModeGrouped && groupingModeFlat) {
    if (config.defaultGrouping === 'flat') {
      groupingModeFlat.checked = true;
    } else {
      groupingModeGrouped.checked = true;
    }
  }

  if (config.windowMode === 'normal') {
    if (modeNormalRadio) modeNormalRadio.checked = true;
    if (windowModeBadge) windowModeBadge.textContent = 'Normal Window';
  } else {
    if (modePopupRadio) modePopupRadio.checked = true;
    if (windowModeBadge) windowModeBadge.textContent = 'App Mode';
  }

  if (chkIgnorePinned) chkIgnorePinned.checked = config.ignorePinnedTabs;
  if (chkReuseExisting) chkReuseExisting.checked = config.reuseExistingAppWindow;
}

/**
 * Bind change listeners to Settings controls
 */
export function bindSettingsEvents({
  elements,
  getConfig,
  setInstalledApps,
  saveConfig,
  onGroupingChange
}) {
  const {
    toolbarModePopup,
    toolbarModeTab,
    groupingModeGrouped,
    groupingModeFlat,
    modePopupRadio,
    modeNormalRadio,
    windowModeBadge,
    chkIgnorePinned,
    chkReuseExisting,
    installedPwasList,
    btnRescanPwas,
    customDomainsList,
    formAddCustom,
    inputCustomDomain,
    statusMessage
  } = elements;

  if (toolbarModePopup) {
    toolbarModePopup.addEventListener('change', async () => {
      if (toolbarModePopup.checked) {
        getConfig().toolbarAction = 'popup';
        await saveConfig({ toolbarAction: 'popup' });
      }
    });
  }

  if (toolbarModeTab) {
    toolbarModeTab.addEventListener('change', async () => {
      if (toolbarModeTab.checked) {
        getConfig().toolbarAction = 'tab';
        await saveConfig({ toolbarAction: 'tab' });
      }
    });
  }

  if (groupingModeGrouped) {
    groupingModeGrouped.addEventListener('change', async () => {
      if (groupingModeGrouped.checked) {
        getConfig().defaultGrouping = 'grouped';
        if (onGroupingChange) onGroupingChange('grouped');
        await saveConfig({ defaultGrouping: 'grouped' });
      }
    });
  }

  if (groupingModeFlat) {
    groupingModeFlat.addEventListener('change', async () => {
      if (groupingModeFlat.checked) {
        getConfig().defaultGrouping = 'flat';
        if (onGroupingChange) onGroupingChange('flat');
        await saveConfig({ defaultGrouping: 'flat' });
      }
    });
  }

  if (modePopupRadio) {
    modePopupRadio.addEventListener('change', async () => {
      if (modePopupRadio.checked) {
        getConfig().windowMode = 'popup';
        if (windowModeBadge) windowModeBadge.textContent = 'App Mode';
        await saveConfig({ windowMode: 'popup' });
      }
    });
  }

  if (modeNormalRadio) {
    modeNormalRadio.addEventListener('change', async () => {
      if (modeNormalRadio.checked) {
        getConfig().windowMode = 'normal';
        if (windowModeBadge) windowModeBadge.textContent = 'Normal Window';
        await saveConfig({ windowMode: 'normal' });
      }
    });
  }

  if (chkIgnorePinned) {
    chkIgnorePinned.addEventListener('change', async () => {
      getConfig().ignorePinnedTabs = chkIgnorePinned.checked;
      await saveConfig({ ignorePinnedTabs: chkIgnorePinned.checked });
    });
  }

  if (chkReuseExisting) {
    chkReuseExisting.addEventListener('change', async () => {
      getConfig().reuseExistingAppWindow = chkReuseExisting.checked;
      await saveConfig({ reuseExistingAppWindow: chkReuseExisting.checked });
    });
  }

  if (btnRescanPwas) {
    btnRescanPwas.addEventListener('click', async () => {
      btnRescanPwas.disabled = true;
      btnRescanPwas.textContent = 'Scanning...';
      try {
        const res = await chrome.runtime.sendMessage({ action: 'GET_INSTALLED_APPS', forceRefresh: true });
        if (res?.success && Array.isArray(res.apps)) {
          setInstalledApps(res.apps);
          renderInstalledPWAs(
            installedPwasList,
            res.apps,
            getConfig().disabledInstalledAppIds,
            async (appId, isEnabled) => {
              const currentDisabled = new Set(getConfig().disabledInstalledAppIds || []);
              if (isEnabled) {
                currentDisabled.delete(appId);
              } else {
                currentDisabled.add(appId);
              }
              getConfig().disabledInstalledAppIds = Array.from(currentDisabled);
              await saveConfig({ disabledInstalledAppIds: getConfig().disabledInstalledAppIds });
            }
          );
        }
      } catch (err) {
        console.warn('Rescan failed:', err);
      } finally {
        btnRescanPwas.disabled = false;
        btnRescanPwas.textContent = 'Scan System';
      }
    });
  }

  if (formAddCustom) {
    formAddCustom.addEventListener('submit', async (e) => {
      e.preventDefault();
      const rawVal = inputCustomDomain.value;
      if (!isSafeDomain(rawVal)) {
        setStatus(statusMessage, 'Invalid or unsafe domain name', true);
        return;
      }

      const clean = normalizeDomain(rawVal);
      if (!clean) {
        setStatus(statusMessage, 'Please enter a valid domain', true);
        return;
      }

      const exists = getConfig().customDomains.some((c) => {
        const d = typeof c === 'string' ? c : c?.domain;
        return normalizeDomain(d) === clean;
      });

      if (!exists) {
        getConfig().customDomains.push({ domain: clean, enabled: true });
        await saveConfig({ customDomains: getConfig().customDomains });
        renderCustomDomains(
          customDomainsList,
          getConfig().customDomains,
          async (index) => {
            getConfig().customDomains.splice(index, 1);
            await saveConfig({ customDomains: getConfig().customDomains });
            renderCustomDomains(customDomainsList, getConfig().customDomains);
          }
        );
        inputCustomDomain.value = '';
        setStatus(statusMessage, `Added: ${clean}`);
      } else {
        setStatus(statusMessage, 'Domain already exists');
      }
    });
  }
}

/**
 * Load complete settings from storage & background worker
 */
export async function loadSettings({
  elements,
  getConfig,
  setConfig,
  getInstalledApps,
  setInstalledApps,
  saveConfigFn
}) {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'GET_CONFIG' });
    if (response && response.success) {
      const updatedConfig = {
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
      setConfig(updatedConfig);

      // Fetch installed apps from system
      try {
        const appRes = await chrome.runtime.sendMessage({ action: 'GET_INSTALLED_APPS' });
        if (appRes?.success && Array.isArray(appRes.apps)) {
          setInstalledApps(appRes.apps);
        }
      } catch {}

      syncSettingsForm(elements, updatedConfig);

      renderInstalledPWAs(
        elements.installedPwasList,
        getInstalledApps(),
        updatedConfig.disabledInstalledAppIds,
        async (appId, isEnabled) => {
          const currentDisabled = new Set(getConfig().disabledInstalledAppIds || []);
          if (isEnabled) {
            currentDisabled.delete(appId);
          } else {
            currentDisabled.add(appId);
          }
          getConfig().disabledInstalledAppIds = Array.from(currentDisabled);
          await saveConfigFn({ disabledInstalledAppIds: getConfig().disabledInstalledAppIds });
        }
      );

      renderCustomDomains(
        elements.customDomainsList,
        updatedConfig.customDomains,
        async (index) => {
          getConfig().customDomains.splice(index, 1);
          await saveConfigFn({ customDomains: getConfig().customDomains });
          renderCustomDomains(elements.customDomainsList, getConfig().customDomains);
        }
      );
    }
  } catch (err) {
    console.error('Error loading settings:', err);
    setStatus(elements.statusMessage, 'Failed to load settings', true);
  }
}

/**
 * Query and render system diagnostics
 * @param {Object} elements
 */
export async function updateDiagnostics({ diagWinCount, diagWinTypes, diagAppsCount }) {
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
