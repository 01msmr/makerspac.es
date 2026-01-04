// bookmark-manager.js - Favoriten-Verwaltung mit LocalStorage

class BookmarkManager {
  constructor() {
    this.storageKey = 'makerspace_bookmarks';
    this.bookmarks = new Set();
    this.loadBookmarks();
  }

  // Lade Bookmarks aus LocalStorage
  loadBookmarks() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const bookmarksArray = JSON.parse(stored);
        this.bookmarks = new Set(bookmarksArray);
        console.log(`📚 Loaded ${this.bookmarks.size} bookmarks from storage`);
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
      localStorage.setItem(this.storageKey, JSON.stringify(bookmarksArray));
      console.log(`💾 Saved ${this.bookmarks.size} bookmarks to storage`);
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
      console.log(`🔖 Removed bookmark: ${locationId}`);
    } else {
      this.bookmarks.add(locationId);
      console.log(`🔖 Added bookmark: ${locationId}`);
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
    const iconClass = isBookmarked ? 'fas fa-bookmark' : 'far fa-bookmark';
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

    console.log('🗑️ All bookmarks cleared');
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
window.bookmarkManager = new BookmarkManager();