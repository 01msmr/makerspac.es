import { consent } from './datasync.js';
import AppConfig from './config.js';

// bookmark-manager.js - Favoriten-Verwaltung mit LocalStorage

export class BookmarkManager {
  constructor() {
    this.storageKey = 'makerspace_bookmarks';
    this.bookmarks = new Set();
    this.loadBookmarks();
  }

  // Lade Bookmarks aus LocalStorage
  loadBookmarks() {
    try {
      const stored = consent.get(this.storageKey);
      if (stored) {
        const bookmarksArray = JSON.parse(stored);
        this.bookmarks = new Set(bookmarksArray);
      }
    } catch (error) {
      console.error('❌ Error loading bookmarks:', error);
      this.bookmarks = new Set();
    }
  }

  // Speichere Bookmarks in LocalStorage
  saveBookmarks() {
    try {
      const bookmarksArray = Array.from(this.bookmarks);
      consent.set(this.storageKey, JSON.stringify(bookmarksArray));
    } catch (error) {
      console.error('❌ Error saving bookmarks:', error);
    }
  }

  // Prüfe ob ein Makerspace gebookmarkt ist
  // ✅ OPTIMIERT: Verwendet location.ID (Zahl)
  isBookmarked(locationId) {
    return this.bookmarks.has(locationId);
  }

  // Toggle Bookmark für einen Makerspace
  // ✅ OPTIMIERT: Verwendet location.ID (Zahl)
  toggleBookmark(locationId) {
    if (this.bookmarks.has(locationId)) {
      this.bookmarks.delete(locationId);
    } else {
      this.bookmarks.add(locationId);
    }
    this.saveBookmarks();
    return this.isBookmarked(locationId);
  }

  // Hole alle gebookmarten Makerspace-IDs
  getBookmarkedIds() {
    return Array.from(this.bookmarks);
  }

  // Anzahl der Bookmarks
  getCount() {
    return this.bookmarks.size;
  }

  // Erstelle HTML für Bookmark-Icon
  // ✅ OPTIMIERT: Verwendet location.ID (Zahl)
  createBookmarkIcon(locationId, className = '') {
    const isBookmarked = this.isBookmarked(locationId);

    // ✅ REFACTORED: Nutze MapIcons.uiMap für Icon-Klassen
    const iconClass = isBookmarked
      ? AppConfig.icons.ui.bookmarkFilled
      : AppConfig.icons.ui.bookmarkOutline;

    const title = isBookmarked ?
      (window.i18n ? window.i18n.t('tooltips.removeBookmark') : 'Remove bookmark') :
      (window.i18n ? window.i18n.t('tooltips.addBookmark') : 'Add bookmark');

    return `<i class="${iconClass} bookmark-icon ${className}" 
               data-location-id="${locationId}" 
               title="${title}"></i>`;
  }

  // Aktualisiere ein Bookmark-Icon im DOM
  // ✅ OPTIMIERT: Verwendet location.ID (Zahl)
  updateBookmarkIcon(iconElement, locationId) {
    if (!iconElement) return;

    const isBookmarked = this.isBookmarked(locationId);
    const title = isBookmarked ?
      (window.i18n ? window.i18n.t('tooltips.removeBookmark') : 'Remove bookmark') :
      (window.i18n ? window.i18n.t('tooltips.addBookmark') : 'Add bookmark');

    // ✅ REFACTORED: Nutze MapIcons.uiMap
    // Aktualisiere Icon-Klasse
    if (isBookmarked) {
      iconElement.classList.remove('far');
      iconElement.classList.add('fas');
    } else {
      iconElement.classList.remove('fas');
      iconElement.classList.add('far');
    }

    // Aktualisiere Tooltip
    iconElement.setAttribute('title', title);
  }

  // Event-Handler für Bookmark-Click
  // ✅ OPTIMIERT: Verwendet location.ID (Zahl)
  handleBookmarkClick(event, locationId) {
    event.preventDefault();
    event.stopPropagation();

    const iconElement = event.target;
    this.toggleBookmark(locationId);
    this.updateBookmarkIcon(iconElement, locationId);

    // Settings-Hash aktualisieren
    if (window.dataStore?.updateSettingsHash) {
      window.dataStore.updateSettingsHash();
    }

    // Trigger Event für andere Komponenten (z.B. Filter-Update)
    window.dispatchEvent(new CustomEvent('bookmarksChanged', {
      detail: {
        locationId: locationId,
        isBookmarked: this.isBookmarked(locationId),
        totalCount: this.getCount()
      }
    }));
  }

  // Löscht alle Bookmarks
  clearAllBookmarks() {
    this.bookmarks.clear();
    this.saveBookmarks();

    // Aktualisiere alle Bookmark-Icons im DOM
    // ✅ OPTIMIERT: Verwendet data-location-id statt data-unique-id
    document.querySelectorAll('.bookmark-icon').forEach(icon => {
      const locationId = icon.getAttribute('data-location-id');
      if (locationId) {
        this.updateBookmarkIcon(icon, parseInt(locationId, 10));
      }
    });

    // Trigger Event für Filter-Update
    window.dispatchEvent(new CustomEvent('bookmarksChanged', {
      detail: {
        locationId: null,
        isBookmarked: false,
        totalCount: 0
      }
    }));

    // Settings-Hash aktualisieren
    if (window.dataStore?.updateSettingsHash) {
      window.dataStore.updateSettingsHash();
    }

  }

  // Initialisiere Event-Listener für Bookmark-Icons im DOM
  // ✅ OPTIMIERT: Verwendet data-location-id statt data-unique-id
  initializeBookmarkListeners(container) {
    if (!container) return;

    const bookmarkIcons = container.querySelectorAll('.bookmark-icon');
    bookmarkIcons.forEach(icon => {
      icon.addEventListener('click', (e) => {
        const locationId = icon.getAttribute('data-location-id');
        if (locationId) {
          this.handleBookmarkClick(e, parseInt(locationId, 10));
        }
      });
    });
  }
}

// Globale Instanz erstellen
export const bookmarkManager = new BookmarkManager();
window.bookmarkManager = bookmarkManager; // for backward-compat lazy access