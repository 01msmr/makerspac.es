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
  isBookmarked(uniqueId) {
    return this.bookmarks.has(uniqueId);
  }

  // Toggle Bookmark für einen Makerspace
  toggleBookmark(uniqueId) {
    if (this.bookmarks.has(uniqueId)) {
      this.bookmarks.delete(uniqueId);
      console.log(`🔖 Removed bookmark: ${uniqueId}`);
    } else {
      this.bookmarks.add(uniqueId);
      console.log(`🔖 Added bookmark: ${uniqueId}`);
    }
    this.saveBookmarks();
    return this.isBookmarked(uniqueId);
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
  createBookmarkIcon(uniqueId, className = '') {
    const isBookmarked = this.isBookmarked(uniqueId);
    const iconClass = isBookmarked ? 'fas fa-bookmark' : 'far fa-bookmark';
    const title = isBookmarked ?
      (window.i18n ? window.i18n.t('tooltips.removeBookmark') : 'Remove bookmark') :
      (window.i18n ? window.i18n.t('tooltips.addBookmark') : 'Add bookmark');

    return `<i class="${iconClass} bookmark-icon ${className}" 
               data-unique-id="${uniqueId}" 
               title="${title}"></i>`;
  }

  // Aktualisiere ein Bookmark-Icon im DOM
  updateBookmarkIcon(iconElement, uniqueId) {
    if (!iconElement) return;

    const isBookmarked = this.isBookmarked(uniqueId);
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
  handleBookmarkClick(event, uniqueId) {
    event.preventDefault();
    event.stopPropagation();

    const iconElement = event.target;
    this.toggleBookmark(uniqueId);
    this.updateBookmarkIcon(iconElement, uniqueId);

    // Trigger Event für andere Komponenten (z.B. Filter-Update)
    window.dispatchEvent(new CustomEvent('bookmarksChanged', {
      detail: {
        uniqueId: uniqueId,
        isBookmarked: this.isBookmarked(uniqueId),
        totalCount: this.getCount()
      }
    }));
  }

  // Initialisiere Event-Listener für Bookmark-Icons im DOM
  initializeBookmarkListeners(container) {
    if (!container) return;

    const bookmarkIcons = container.querySelectorAll('.bookmark-icon');
    bookmarkIcons.forEach(icon => {
      icon.addEventListener('click', (e) => {
        const uniqueId = icon.getAttribute('data-unique-id');
        if (uniqueId) {
          this.handleBookmarkClick(e, uniqueId);
        }
      });
    });
  }
}

// Globale Instanz erstellen
window.bookmarkManager = new BookmarkManager();