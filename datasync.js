// ConsentManager - Alle Daten sind funktional notwendig (Sprache, Theme, Favoriten,
// Kartendienst) — kein Tracking. Daher immer direkt in localStorage speichern.
class ConsentManager {
  get(key) { return localStorage.getItem(key); }
  set(key, value) { localStorage.setItem(key, value); }
  remove(key) { localStorage.removeItem(key); }
}

// Globale Instanz
export const consent = new ConsentManager();

// Hash frühzeitig decodieren → localStorage schreiben, bevor BookmarkManager liest
(function applySettingsFromHash() {
  const hash = location.hash;
  if (!hash.startsWith('#s=')) return;
  const raw = hash.slice(3);
  const [settings, bookmarks] = raw.split('-');
  if (settings && settings.length >= 3) {
    const cs = ['auto', 'light', 'dark'][parseInt(settings[0])];
    const lang = settings.slice(1, 3);
    if (cs) localStorage.setItem('color-scheme', cs);
    if (lang.length === 2) localStorage.setItem('preferred_language', lang);
  }
  if (bookmarks) {
    const ids = bookmarks.split('.').map(Number).filter(n => !isNaN(n) && n > 0);
    if (ids.length) localStorage.setItem('makerspace_bookmarks', JSON.stringify(ids));
  }
})();


/* =================================================================
 * BookmarkSync - anonyme Synchronisierung
 * ================================================================= */

export class BookmarkSync {
  constructor(bookmarkManager) {
    this.bookmarkManager = bookmarkManager;
    window.translations = null;
  }

  init(translations) {
    window.translations = translations;
    this.checkUrlImport();
    this.setupEventListeners();
  }

  checkUrlImport() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('bookmarks')) {
      const ids = urlParams.get('bookmarks').split(',').filter(id => id);
      if (ids.length > 0) {
        this.importBookmarks(ids);
        // URL-Parameter entfernen nach Import
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }

  importBookmarks(ids) {
    const currentLang = window.currentLanguage || 'de';
    const t = window.translations || {}; // ✅ FIX
    let imported = 0;

    ids.forEach(id => {
      if (!this.bookmarkManager.isBookmarked(id)) {
        this.bookmarkManager.toggleBookmark(id);
        imported++;
      }
    });

    if (imported > 0) {
      const msg = t.sync?.importSuccess?.[currentLang] || `${imported} Favoriten importiert`;
      this.showNotification(msg.replace('{count}', imported), 'success');
    }
  }

  /**
   * Exportiert Bookmarks als URL
   * ✅ NEU: Unterstützt ID-basierte URLs
   */
  exportAsUrl(useLocationRoute = true) {
    const bookmarkIds = this.bookmarkManager.getBookmarkedIds();

    if (bookmarkIds.length === 0) {
      const currentLang = window.currentLanguage || 'de';
      const t = window.translations || {}; // ✅ FIX
      const msg = t.sync?.noBookmarks?.[currentLang] || 'Keine Favoriten zum Exportieren';
      this.showNotification(msg, 'warning');
      return null;
    }

    if (useLocationRoute && bookmarkIds.length > 0) {
      // Option 1: ID-basierte Route
      return `${window.location.origin}${window.location.pathname}#/location/${bookmarkIds.join(',')}`;
    } else {
      // Option 2: Fallback, 
      return `${window.location.origin}${window.location.pathname}?bookmarks=${bookmarkIds.join(',')}`;
    }
  }

  /**
   * Zeigt Export-Dialog mit URL und QR-Code
   */
  showExportDialog() {
    const url = this.exportAsUrl();
    if (!url) return;

    const currentLang = window.currentLanguage || 'de';
    const t = window.translations || {}; // ✅ Direkt window.translations nutzen

    const dialog = document.createElement('div');
    dialog.className = 'sync-dialog-overlay';

    dialog.innerHTML = `
    <div class="sync-dialog">
      <h2>${t.sync?.exportTitle?.[currentLang] || 'Favoriten teilen'}</h2>
      
      <div class="sync-section">
        <label>${t.sync?.shareUrl?.[currentLang] || 'Link zum Teilen:'}</label>
        <div class="sync-url-container">
          <input type="text" class="sync-url-input" value="${url}" readonly>
          <button class="sync-btn sync-btn-copy" onclick="bookmarkSync.copyUrl('${url}')">
            <i class="far fa-copy"></i>
          </button>
        </div>
      </div>

      <div class="sync-section">
        <label>${t.sync?.qrCode?.[currentLang] || 'QR-Code:'}</label>
        <div class="sync-qr-container" id="qr-code"></div>
      </div>

      <div class="sync-actions">
        <button class="sync-btn sync-btn-secondary" onclick="bookmarkSync.closeDialog()">
          ${t.sync?.close?.[currentLang] || 'Schließen'}
        </button>
      </div>
    </div>
  `;

    document.body.appendChild(dialog);

    if (typeof QRCode !== 'undefined') {
      new QRCode(document.getElementById('qr-code'), {
        text: url,
        width: 200,
        height: 200,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
    }

    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        this.closeDialog();
      }
    });
  }


  /**
   * Zeigt Import-Dialog
   */
  showImportDialog() {
    const currentLang = window.currentLanguage || 'de';
    const t = window.translations || {}; // ✅ FIX

    const dialog = document.createElement('div');
    dialog.className = 'sync-dialog-overlay';

    dialog.innerHTML = `
    <div class="sync-dialog">
      <h2>${t.sync?.importTitle?.[currentLang] || 'Favoriten importieren'}</h2>
      
      <div class="sync-section">
        <label>${t.sync?.pasteUrl?.[currentLang] || 'URL einfügen:'}</label>
        <input type="text" class="sync-url-input" id="import-url" placeholder="https://...">
      </div>

      <div class="sync-actions">
        <button class="sync-btn sync-btn-secondary" onclick="bookmarkSync.closeDialog()">
          ${t.sync?.cancel?.[currentLang] || 'Abbrechen'}
        </button>
        <button class="sync-btn sync-btn-primary" onclick="bookmarkSync.importFromUrl()">
          ${t.sync?.import?.[currentLang] || 'Importieren'}
        </button>
      </div>
    </div>
  `;

    document.body.appendChild(dialog);

    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        this.closeDialog();
      }
    });

    setTimeout(() => {
      document.getElementById('import-url').focus();
    }, 100);
  }

  /**
   * Importiert Bookmarks aus URL-Input
   */
  importFromUrl() {
    const input = document.getElementById('import-url');
    if (!input) return;

    const url = input.value.trim();

    try {
      const urlObj = new URL(url);
      const params = new URLSearchParams(urlObj.search);

      if (params.has('bookmarks')) {
        const ids = params.get('bookmarks').split(',').filter(id => id);
        this.importBookmarks(ids);
        this.closeDialog();
      } else {
        const currentLang = window.currentLanguage || 'de';
        const msg = window.translations.sync?.invalidUrl?.[currentLang] ||
          'Ungültige URL';
        this.showNotification(msg, 'error');
      }
    } catch (e) {
      const currentLang = window.currentLanguage || 'de';
      const msg = window.translations.sync?.invalidUrl?.[currentLang] ||
        'Ungültige URL';
      this.showNotification(msg, 'error');
    }
  }

  /**
   * Kopiert URL in die Zwischenablage
   */
  async copyUrl(url) {
    try {
      await navigator.clipboard.writeText(url);
      const currentLang = window.currentLanguage || 'de';
      const msg = window.translations.sync?.copied?.[currentLang] ||
        'Link kopiert!';
      this.showNotification(msg, 'success');
    } catch (err) {
      // Fallback für ältere Browser
      const input = document.querySelector('.sync-url-input');
      if (input) {
        input.select();
        document.execCommand('copy');
        const currentLang = window.currentLanguage || 'de';
        const msg = window.translations.sync?.copied?.[currentLang] ||
          'Link kopiert!';
        this.showNotification(msg, 'success');
      }
    }
  }

  /**
   * Schließt alle Dialoge
   */
  closeDialog() {
    const dialogs = document.querySelectorAll('.sync-dialog-overlay');
    dialogs.forEach(dialog => dialog.remove());
  }

  /**
   * Zeigt Sync-Menü an
   */
  showSyncMenu(button) {
    // Schließe existierendes Menü
    const existingMenu = document.querySelector('.sync-menu');
    if (existingMenu) {
      existingMenu.remove();
      return;
    }

    const currentLang = window.currentLanguage || 'de';
    const bookmarkCount = this.bookmarkManager.getBookmarkedIds().length;

    const menu = document.createElement('div');
    menu.className = 'sync-menu';

    menu.innerHTML = `
      <div class="sync-menu-item sync-status">
        <i class="fas fa-bookmark"></i>
        <span>${bookmarkCount} ${window.translations.sync?.favorites?.[currentLang] || 'Favoriten'}</span>
      </div>
      <div class="sync-menu-item" onclick="bookmarkSync.showExportDialog()">
        <i class="fas fa-share-alt"></i>
        <span>${window.translations.sync?.export?.[currentLang] || 'Teilen'}</span>
      </div>
      <div class="sync-menu-item" onclick="bookmarkSync.showImportDialog()">
        <i class="fas fa-download"></i>
        <span>${window.translations.sync?.import?.[currentLang] || 'Importieren'}</span>
      </div>
      <div class="sync-menu-item sync-danger" onclick="bookmarkSync.clearAllBookmarks()">
        <i class="fas fa-trash"></i>
        <span>${window.translations.sync?.clearAll?.[currentLang] || 'Alle löschen'}</span>
      </div>
    `;

    // Position berechnen
    const rect = button.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${rect.bottom + 5}px`;
    menu.style.left = `${rect.left}px`;

    document.body.appendChild(menu);

    // Schließen bei Klick außerhalb
    setTimeout(() => {
      document.addEventListener('click', function closeMenu(e) {
        if (!menu.contains(e.target) && e.target !== button) {
          menu.remove();
          document.removeEventListener('click', closeMenu);
        }
      });
    }, 0);
  }

  /**
   * Löscht alle Bookmarks nach Bestätigung
   */
  clearAllBookmarks() {
    const currentLang = window.currentLanguage || 'de';
    const msg = (window.translations || {}).sync?.confirmClear?.[currentLang] ||
      'Wirklich alle Favoriten löschen?';

    if (confirm(msg)) {
      this.bookmarkManager.clearAllBookmarks();
      this.closeDialog();
      const existingMenu = document.querySelector('.sync-menu');
      if (existingMenu) existingMenu.remove();

      const successMsg = window.translations.sync?.clearedAll?.[currentLang] ||
        'Alle Favoriten gelöscht';
      this.showNotification(successMsg, 'success');
    }
  }

  /**
   * Zeigt Benachrichtigung
   */
  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `sync-notification sync-notification-${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.classList.add('show');
    }, 10);

    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  /**
   * Setup Event Listeners
   */
  setupEventListeners() {
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + Shift + E = Export
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        this.showExportDialog();
      }
      // Ctrl/Cmd + Shift + I = Import
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'I') {
        e.preventDefault();
        this.showImportDialog();
      }
    });
  }

  /**
   * ✅ Settings synchronisieren
   */
  syncSettings(settings) {
    const currentSettings = {
      colorScheme: settings.colorScheme || consent.get('color-scheme') || 'auto',
      language: settings.language || consent.get('preferred_language') || 'de'
    };

    // Speichern
    consent.set('user-settings', JSON.stringify(currentSettings));

  }

  /**
   * ✅ Settings aus Sync-URL laden
   */
  loadSettingsFromSync(syncUrl) {
    try {
      const url = new URL(syncUrl);
      const data = JSON.parse(url.searchParams.get('data') || '{}');

      if (data.settings) {
        // Color Scheme anwenden
        if (data.settings.colorScheme) {
          consent.set('color-scheme', data.settings.colorScheme);
          if (window.languageSwitcher) {
            window.languageSwitcher.setColorScheme(data.settings.colorScheme);
          }
        }

        // Sprache anwenden
        if (data.settings.language) {
          consent.set('preferred_language', data.settings.language);
          if (window.languageSwitcher) {
            window.languageSwitcher.changeLanguage(data.settings.language);
          }
        }

        this.showNotification('Settings synchronized', 'success');
      }
    } catch (error) {
      console.error('Error loading settings from sync:', error);
    }
  }

  /**
   * ✅ QR-Code mit Settings generieren
   */
  generateSyncDataWithSettings() {
    const bookmarks = this.bookmarkManager ? this.bookmarkManager.getBookmarkedIds() : [];
    const settings = JSON.parse(consent.get('user-settings') || '{}');

    const syncData = {
      bookmarks: bookmarks,
      settings: settings,
      timestamp: Date.now()
    };

    return JSON.stringify(syncData);
  }
}

