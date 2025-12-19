// search-pills.js - Pills innerhalb der Searchbar

class SearchPillsManager {
  constructor(searchBar) {
    this.searchBar = searchBar;
    this.container = this.createContainer();
    this.pills = new Map(); // Map<id, {text, type, count}>
    this.onChangeCallback = null;
    
    this.initializeEventListeners();
    console.log('✅ SearchPillsManager initialized');
  }
  
  createContainer() {
    const container = document.createElement('div');
    container.className = 'search-pills-container';
    container.id = 'search-pills-container';
    
    // Füge innerhalb der search-input-wrapper ein (vor searchBar)
    this.searchBar.parentElement.insertBefore(container, this.searchBar);
    
    return container;
  }
  
  /**
   * Füge Pill hinzu
   */
  addPill(suggestion) {
    const id = this.generatePillId(suggestion);
    
    // Verhindere Duplikate
    if (this.pills.has(id)) {
      console.log(`ℹ️ Pill already exists: ${id}`);
      return;
    }
    
    this.pills.set(id, suggestion);
    this.render();
    this.updateSearchBarPadding();
    
    if (this.onChangeCallback) {
      this.onChangeCallback(this.getPillsArray());
    }
    
    console.log(`➕ Added pill: ${suggestion.text} (${suggestion.type})`);
  }
  
  /**
   * Generiere eindeutige ID für Pill
   */
  generatePillId(suggestion) {
    return `${suggestion.type}-${suggestion.text.toLowerCase().replace(/\s+/g, '-')}`;
  }
  
  /**
   * Entferne Pill
   */
  removePill(id) {
    if (!this.pills.has(id)) {
      return;
    }
    
    const pill = this.pills.get(id);
    console.log(`➖ Removed pill: ${pill.text} (${pill.type})`);
    
    this.pills.delete(id);
    this.render();
    this.updateSearchBarPadding();
    
    if (this.onChangeCallback) {
      this.onChangeCallback(this.getPillsArray());
    }
  }
  
  /**
   * Entferne letzte Pill (für Backspace)
   */
  removeLastPill() {
    if (this.pills.size === 0) return false;
    
    // Hole letzte Pill
    const pillsArray = Array.from(this.pills.keys());
    const lastId = pillsArray[pillsArray.length - 1];
    
    // Animiere removal
    const pillElement = this.container.querySelector(`[data-id="${lastId}"]`);
    if (pillElement) {
      pillElement.classList.add('removing');
      setTimeout(() => {
        this.removePill(lastId);
      }, 150); // Animation duration
    } else {
      this.removePill(lastId);
    }
    
    return true;
  }
  
  /**
   * Clear alle Pills
   */
  clear() {
    console.log('🗑️ Clearing all pills');
    
    this.pills.clear();
    this.render();
    this.updateSearchBarPadding();
    
    if (this.onChangeCallback) {
      this.onChangeCallback([]);
    }
  }
  
  /**
   * Rendere Pills
   */
  render() {
    this.container.innerHTML = '';
    
    if (this.pills.size === 0) {
      this.searchBar.classList.remove('has-pills');
      return;
    }
    
    this.searchBar.classList.add('has-pills');
    
    this.pills.forEach((pill, id) => {
      const pillElement = document.createElement('div');
      pillElement.className = 'search-pill';
      pillElement.dataset.id = id;
      pillElement.dataset.type = pill.type;
      pillElement.setAttribute('role', 'button');
      pillElement.setAttribute('aria-label', `Remove ${pill.text}`);
      
      pillElement.innerHTML = `
        <span class="search-pill-text">${pill.text}</span>
        <span class="search-pill-remove" aria-hidden="true">×</span>
      `;
      
      // Remove-Handler (auf gesamte Pill)
      pillElement.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removePill(id);
      });
      
      this.container.appendChild(pillElement);
    });
  }
  
  /**
     * Update Searchbar Padding (dynamisch basierend auf Pills-Breite)
     */
  updateSearchBarPadding() {
    if (this.pills.size === 0) {
      // ✨ ÄNDERUNG: Entferne die Variable und die Klasse
      this.searchBar.style.removeProperty('--dynamic-pill-padding');
      this.searchBar.classList.remove('has-pills');
      return;
    }

    this.searchBar.classList.add('has-pills');

    // Warte kurz, damit DOM aktualisiert ist
    requestAnimationFrame(() => {
      const containerWidth = this.container.scrollWidth;
      const padding = containerWidth + 24; // +24px für Spacing

      // ✨ FIX: Setze die CSS-Variable (ohne !important)
      this.searchBar.style.setProperty('--dynamic-pill-padding', `${padding}px`);
      // Entferne die alte, nicht verwendete Variable
      this.searchBar.style.removeProperty('--pills-width');
    });
  }
  
  /**
   * Get alle Pills als Array
   */
  getPillsArray() {
    return Array.from(this.pills.values());
  }
  
  /**
   * Get Pill-IDs
   */
  getPillIds() {
    return Array.from(this.pills.keys());
  }
  
  /**
   * Prüfe ob Pill existiert
   */
  hasPill(suggestion) {
    const id = this.generatePillId(suggestion);
    return this.pills.has(id);
  }
  
  /**
   * Anzahl Pills
   */
  count() {
    return this.pills.size;
  }
  
  /**
   * Callback bei Änderungen
   */
  onChange(callback) {
    this.onChangeCallback = callback;
  }
  
  /**
   * Lade Pills aus Array (z.B. von URL)
   */
  loadPills(pillsArray) {
    console.log('📥 Loading pills:', pillsArray);
    
    this.pills.clear();
    pillsArray.forEach(pill => {
      const id = this.generatePillId(pill);
      this.pills.set(id, pill);
    });
    
    this.render();
    this.updateSearchBarPadding();
    
    if (this.onChangeCallback) {
      this.onChangeCallback(this.getPillsArray());
    }
  }
  
  /**
   * Event Listeners
   */
  initializeEventListeners() {
    // Backspace in leerem Suchfeld = Remove last pill
    this.searchBar.addEventListener('keydown', (e) => {
      if (e.code === 'Backspace' && 
          this.searchBar.value === '' && 
          this.pills.size > 0) {
        e.preventDefault();
        this.removeLastPill();
      }
    });
    
    // Focus Searchbar wenn auf Container geklickt wird
    this.container.addEventListener('click', (e) => {
      if (e.target === this.container) {
        this.searchBar.focus();
      }
    });
    
    // Update Padding beim Resize (für responsive)
    const resizeObserver = new ResizeObserver(() => {
      if (this.pills.size > 0) {
        this.updateSearchBarPadding();
      }
    });
    
    resizeObserver.observe(this.container);
  }
  
  /**
   * Destroy (Cleanup)
   */
  destroy() {
    if (this.container && this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
  }
}

// Export
window.SearchPillsManager = SearchPillsManager;