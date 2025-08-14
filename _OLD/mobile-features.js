// ===== ENHANCED MOBILE FEATURES - Kompatibel mit map.js v4 & mobile.css v3 =====

console.log('📱 Loading ENHANCED Mobile Features v3...');

// ===== MOBILE UTILITIES =====
const MobileUtils = {
  isMobile: () => window.innerWidth <= 768,
  isTouch: () => 'ontouchstart' in window,

  detectFeatures() {
    return {
      touchSupport: this.isTouch(),
      geolocation: 'geolocation' in navigator,
      vibration: 'vibrate' in navigator,
      serviceWorker: 'serviceWorker' in navigator
    };
  }
};

// ===== ENHANCED BOTTOM SHEET HANDLER =====
class EnhancedBottomSheetHandler {
  constructor() {
    this.sheet = null;
    this.searchBar = null;
    this.searchContainer = null;
    this.startY = 0;
    this.currentY = 0;
    this.isDragging = false;
    this.isOpen = false;

    this.config = {
      closeThreshold: 60,
      maxDragDistance: 100,
      enableHaptics: 'vibrate' in navigator
    };

    this.init();
  }

  init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setup());
    } else {
      this.setup();
    }
  }

  setup() {
    if (!MobileUtils.isMobile()) return;

    this.sheet = document.getElementById('suggestions-dropdown');
    this.searchBar = document.getElementById('search-bar');
    this.searchContainer = document.querySelector('.search-container');

    if (!this.sheet || !this.searchBar || !this.searchContainer) {
      console.warn('Bottom Sheet: Required elements not found');
      return;
    }

    this.setupEventListeners();
    console.log('✅ Enhanced Bottom Sheet Handler initialized v3');
  }

  setupEventListeners() {
    // Touch Events für Drag-to-Close (nur für Sheet, nicht für Search Container)
    this.sheet.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
    this.sheet.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
    this.sheet.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: true });

    // State-Überwachung für Sheet
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        if (mutation.attributeName === 'class') {
          const isActive = this.sheet.classList.contains('is-active');

          if (isActive !== this.isOpen) {
            this.isOpen = isActive;

            if (isActive) {
              this.onSheetOpen();
            } else {
              this.onSheetClose();
            }
          }
        }
      });
    });

    observer.observe(this.sheet, {
      attributes: true,
      attributeFilter: ['class']
    });

    // Escape Key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.closeSheet();
      }
    });

    // Enhanced Click Outside Handler - kompatibel mit neuer Z-Index Struktur
    document.addEventListener('click', (e) => {
      const isSearchClick = this.searchContainer.contains(e.target);
      const isSheetClick = this.sheet.contains(e.target);

      if (!isSearchClick && !isSheetClick) {
        if (this.isOpen) {
          this.closeSheet();
        }
        // Collapse Search Container wenn außerhalb geklickt
        this.collapseSearchContainer();
      }
    });
  }

  handleTouchStart(e) {
    const isAtTop = this.sheet.scrollTop <= 5;
    if (!isAtTop) return;

    this.startY = e.touches[0].clientY;
    this.currentY = this.startY;
    this.isDragging = false;
    this.sheet.style.transition = 'none';
  }

  handleTouchMove(e) {
    if (this.startY === 0) return;

    this.currentY = e.touches[0].clientY;
    const deltaY = this.currentY - this.startY;

    if (deltaY > 0 && this.sheet.scrollTop <= 5) {
      this.isDragging = true;
      e.preventDefault();

      const resistance = Math.min(deltaY / 2, this.config.maxDragDistance);
      this.sheet.style.transform = `translateY(${resistance}px)`;

      const opacity = Math.max(0.7, 1 - (resistance / this.config.maxDragDistance));
      this.sheet.style.opacity = opacity;
    }
  }

  handleTouchEnd() {
    if (this.startY === 0) return;

    const deltaY = this.currentY - this.startY;

    this.sheet.style.transition = '';
    this.sheet.style.opacity = '';

    if (this.isDragging && deltaY > this.config.closeThreshold) {
      this.closeSheet();
      this.collapseSearchContainer();

      if (this.config.enableHaptics) {
        navigator.vibrate(30);
      }
    } else if (this.isDragging) {
      this.sheet.style.transform = 'translateY(0)';
    }

    this.startY = 0;
    this.currentY = 0;
    this.isDragging = false;
  }

  onSheetOpen() {
    document.body.style.overflow = 'hidden';
  }

  onSheetClose() {
    document.body.style.overflow = '';
    this.sheet.style.transform = '';
    this.sheet.style.opacity = '';
  }

  closeSheet() {
    this.sheet.classList.remove('is-active');
    this.searchBar.classList.remove('has-suggestions');
  }

  // Search Container Management - kompatibel mit neuen CSS-Klassen
  expandSearchContainer() {
    if (this.searchContainer) {
      this.searchContainer.classList.add('expanded');
      this.searchBar.focus();

      if (this.config.enableHaptics) {
        navigator.vibrate(10);
      }
    }
  }

  collapseSearchContainer() {
    if (this.searchContainer) {
      this.searchContainer.classList.remove('expanded');
      this.closeSheet();
    }
  }
}

// ===== ENHANCED GPS LOCATION BUTTON =====
class EnhancedLocationButton {
  constructor() {
    if (!MobileUtils.isMobile()) return;
    this.createButton();
  }

  createButton() {
    const existingFab = document.querySelector('.mobile-location-fab');
    if (existingFab) {
      existingFab.remove();
    }

    const fab = document.createElement('div');
    fab.className = 'mobile-location-fab';
    fab.innerHTML = '📍';

    // Enhanced Styling kompatibel mit neuer Z-Index Struktur
    fab.style.cssText = `
      position: fixed;
      bottom: 75px;
      right: 15px;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: #2196F3;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      box-shadow: 0 2px 8px rgba(33, 150, 243, 0.3);
      cursor: pointer;
      z-index: 1050;
      transition: transform 0.1s ease;
      user-select: none;
      touch-action: manipulation;
    `;

    // Event Listener
    fab.addEventListener('click', this.handleLocationClick.bind(this));
    document.body.appendChild(fab);

    console.log('✅ Enhanced GPS Button created v3');
  }

  async handleLocationClick() {
    const fab = document.querySelector('.mobile-location-fab');
    if (!fab) return;

    fab.style.transform = 'scale(0.95)';
    setTimeout(() => fab.style.transform = 'scale(1)', 100);

    try {
      fab.innerHTML = '⌛';

      const options = {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000
      };

      console.log('📍 Starting geolocation request...');
      const position = await this.getCurrentLocation(options);
      console.log('📍 Geolocation successful:', position.coords);

      const { latitude, longitude } = position.coords;

      if (typeof map !== 'undefined') {
        map.flyTo([latitude, longitude], 14);

        // Temporärer Marker
        const currentLocationMarker = L.marker([latitude, longitude], {
          icon: L.divIcon({
            className: 'current-location-marker',
            html: '📱',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          })
        }).addTo(map);

        setTimeout(() => {
          if (map.hasLayer(currentLocationMarker)) {
            map.removeLayer(currentLocationMarker);
          }
        }, 3000);
      }

      fab.innerHTML = '✅';
      setTimeout(() => fab.innerHTML = '📍', 800);

      this.findNearbyMakerspaces(latitude, longitude);

    } catch (error) {
      console.error('📍 Geolocation error:', error);
      fab.innerHTML = '❌';
      setTimeout(() => fab.innerHTML = '📍', 800);

      let errorMessage = 'Standort nicht verfügbar';
      if (error.code === 1) {
        errorMessage = 'Standort-Berechtigung verweigert';
      } else if (error.code === 2) {
        errorMessage = 'Standort nicht ermittelbar';
      } else if (error.code === 3) {
        errorMessage = 'Standort-Timeout';
      }

      this.showToast(errorMessage);
    }
  }

  getCurrentLocation(options = {}) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        console.error('📍 Geolocation not supported');
        reject(new Error('Geolocation nicht unterstützt'));
        return;
      }

      console.log('📍 Requesting location with options:', options);

      const defaultOptions = {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000
      };

      const finalOptions = { ...defaultOptions, ...options };

      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log('📍 Position received:', position);
          resolve(position);
        },
        (error) => {
          console.error('📍 Position error:', error);
          reject(error);
        },
        finalOptions
      );
    });
  }

  findNearbyMakerspaces(lat, lng) {
    if (typeof json === 'undefined') return;

    const nearbySpaces = json
      .map(location => {
        const distance = this.calculateDistance(lat, lng, location.loc.lat, location.loc.long);
        return { ...location, distance };
      })
      .filter(location => location.distance <= 30)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 8); // Bis zu 8 Ergebnisse für GPS

    if (nearbySpaces.length > 0) {
      this.showNearbyResults(nearbySpaces);
    } else {
      this.showToast('Keine Makerspaces in der Nähe');
    }
  }

  calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  showNearbyResults(nearbySpaces) {
    const searchBar = document.getElementById('search-bar');
    const suggestionsDropdown = document.getElementById('suggestions-dropdown');
    const searchContainer = document.querySelector('.search-container');

    if (!searchBar || !suggestionsDropdown || !searchContainer) return;

    // Erweitere Search Container für GPS-Ergebnisse
    searchContainer.classList.add('expanded');
    searchBar.value = '📍 In der Nähe';
    suggestionsDropdown.innerHTML = '';

    // Grid Container für Mobile - kompatibel mit v3 CSS
    const gridContainer = document.createElement('div');
    gridContainer.classList.add('suggestions-grid');

    // Setze Attribute für v3 CSS
    const maxVisible = nearbySpaces.length <= 10 ? 4 : 6;
    gridContainer.setAttribute('data-max-visible', maxVisible.toString());
    gridContainer.setAttribute('data-total-results', nearbySpaces.length.toString());

    nearbySpaces.forEach(location => {
      const item = document.createElement('div');
      item.classList.add('suggestion-item');

      const contentDiv = document.createElement('div');
      contentDiv.classList.add('item-content');
      contentDiv.innerHTML = `<div class="item-name">${location.name} (${location.distance.toFixed(1)}km)</div>`;

      item.appendChild(contentDiv);

      item.addEventListener('click', () => {
        if (typeof map !== 'undefined') {
          map.flyTo([location.loc.lat, location.loc.long], 15);
          const targetMarker = allMarkers?.find(m => m.uniqueId === location.uniqueId);
          if (targetMarker) targetMarker.openPopup();
        }

        suggestionsDropdown.classList.remove('is-active');
        searchBar.classList.remove('has-suggestions');

        // Collapse search container nach GPS-Auswahl
        setTimeout(() => searchContainer.classList.remove('expanded'), 300);

        // Haptic Feedback
        if (navigator.vibrate) {
          navigator.vibrate(20);
        }
      });

      gridContainer.appendChild(item);
    });

    suggestionsDropdown.appendChild(gridContainer);
    suggestionsDropdown.classList.add('is-active');
    searchBar.classList.add('has-suggestions');
  }

  showToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 120px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0,0,0,0.8);
      color: white;
      padding: 8px 16px;
      border-radius: 16px;
      z-index: 2000;
      font-size: 13px;
      opacity: 0;
      transition: opacity 0.2s ease;
    `;

    document.body.appendChild(toast);
    setTimeout(() => toast.style.opacity = '1', 10);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => document.body.removeChild(toast), 200);
    }, 1500);
  }
}

// ===== ENHANCED MOBILE OPTIMIZATIONS =====
class EnhancedMobileOptimizations {
  constructor() {
    this.features = {};
    this.init();
  }

  async init() {
    if (!MobileUtils.isMobile()) {
      console.log('📱 Desktop detected - Enhanced mobile optimizations skipped');
      return;
    }

    console.log('🔧 Initializing ENHANCED Mobile Features v3...');

    // Core Features
    this.features.bottomSheet = new EnhancedBottomSheetHandler();
    this.features.locationButton = new EnhancedLocationButton();

    // Setup
    this.setupViewportFix();
    this.setupOrientationHandling();
    this.setupKeyboardOptimizations();

    console.log('✅ ENHANCED Mobile Features v3 ready');
  }

  setupViewportFix() {
    const setViewportHeight = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };

    setViewportHeight();
    window.addEventListener('resize', setViewportHeight);
    window.addEventListener('orientationchange', () => {
      setTimeout(setViewportHeight, 100);
    });
  }

  setupOrientationHandling() {
    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        if (typeof map !== 'undefined') {
          map.invalidateSize();
        }

        const suggestionsDropdown = document.getElementById('suggestions-dropdown');
        const searchContainer = document.querySelector('.search-container');

        if (suggestionsDropdown) {
          suggestionsDropdown.classList.remove('is-active');
        }

        if (searchContainer) {
          searchContainer.classList.remove('expanded');
        }
      }, 100);
    });
  }

  setupKeyboardOptimizations() {
    const searchBar = document.getElementById('search-bar');

    if (searchBar && MobileUtils.isMobile()) {
      searchBar.addEventListener('keydown', (e) => {
        // Leertaste = Enter auf Mobile
        if (e.code === 'Space' || e.key === ' ') {
          e.preventDefault();

          // Simuliere Enter-Taste
          const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true
          });

          searchBar.dispatchEvent(enterEvent);
          searchBar.blur();

          console.log('📱 Space → Enter: Keyboard hidden');

          // Haptic Feedback
          if (navigator.vibrate) {
            navigator.vibrate(20);
          }
        }
      });

      console.log('✅ Enhanced mobile keyboard optimizations active (Space = Enter)');
    }
  }

  // CLEAN: Keine Connection Lines für Mobile (kompatibel mit map.js v4)
  createConnectionLine(suggestionItem, targetMarker) {
    if (!MobileUtils.isMobile()) return false;

    // Clean Mobile Design: Keine Linien oder Highlights
    console.log('📱 Clean mobile design: No connection lines');
    return true; // Mobile übernimmt, macht aber nichts
  }
}

// ===== ENHANCED INITIALIZATION =====
let enhancedMobileOptimizations;

function initializeEnhancedMobile() {
  if (MobileUtils.isMobile()) {
    enhancedMobileOptimizations = new EnhancedMobileOptimizations();

    // Global verfügbar machen
    window.MobileOptimizations = enhancedMobileOptimizations;
    window.MobileUtils = MobileUtils;

    console.log('📱 ENHANCED Mobile Features v3 initialized');
  } else {
    console.log('💻 Desktop mode - enhanced mobile features not loaded');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeEnhancedMobile);
} else {
  initializeEnhancedMobile();
}

// Enhanced Resize Handling
window.addEventListener('resize', () => {
  const isMobileNow = MobileUtils.isMobile();
  const hasMobileOpt = !!enhancedMobileOptimizations;

  if (isMobileNow && !hasMobileOpt) {
    initializeEnhancedMobile();
  } else if (!isMobileNow && hasMobileOpt) {
    // Switch to Desktop - cleanup
    enhancedMobileOptimizations = null;
    window.MobileOptimizations = null;

    // Reset styles
    const sheet = document.getElementById('suggestions-dropdown');
    const searchContainer = document.querySelector('.search-container');

    if (sheet) {
      sheet.style.transform = '';
      sheet.style.opacity = '';
      sheet.style.height = '';
    }

    if (searchContainer) {
      searchContainer.classList.remove('expanded');
    }

    document.body.style.overflow = '';

    // Remove mobile elements
    const fab = document.querySelector('.mobile-location-fab');
    if (fab) fab.remove();

    console.log('📱 Switched to Desktop - Enhanced mobile features disabled');
  }
});

console.log('📱 ENHANCED Mobile Features v3 loaded - Compatible with map.js v4 & mobile.css v3');