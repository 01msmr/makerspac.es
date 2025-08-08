// map.js (Final, Guaranteed Working Version)

window.addEventListener("keydown", (e) => {
  if (e.code === 'F3' || ((e.ctrlKey || e.metaKey) && e.code === 'KeyF')) {
    e.preventDefault();
    const search = document.querySelector('#search-bar')
    search.focus()
  }
})

document.addEventListener('DOMContentLoaded', () => {
  let map;
  let allMarkers = [];
  let json = [];
  let zoomDebounceTimeout;

  const defaultIcon = new L.Icon.Default();
  const highlightIcon = new L.Icon({
    iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
  });

  // Define a new icon that is 50% larger. pre-calculate all the sizes.
  const hoverIcon = new L.Icon({
    iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-black.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [37.5, 61.5], // 25x1.5, 41x1.5
    iconAnchor: [18.75, 61.5], // 12x1.5, 41x1.5
    popupAnchor: [1.5, -51],    // 1x1.5, -34x1.5
    shadowSize: [61.5, 61.5]  // 41x1.5
  });

  async function initializeApp() {
    try {
      setupMap();
      await loadData();
      setupSearch();
    } catch (error) {
      console.error("A critical error occurred during app initialization:", error);
      alert("The application could not be started. Please check the developer console.");
    }
  }

  function setupMap() {
    map = new L.Map('map');
    const osmUrl = 'https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=FWYhsr9NFS0ukx1nyaXp';
    const osmAttrib = '\u003ca href=\"https://www.maptiler.com/copyright/\" target=\"_blank\"\u003e\u0026copy; MapTiler\u003c/a\u003e \u003ca href=\"https://www.openstreetmap.org/copyright\" target=\"_blank\"\u003e\u0026copy; OpenStreetMap contributors\u003c/a\u003e';
    const osmLayer = new L.TileLayer(osmUrl, {
      minZoom: 2, maxZoom: 19, tileSize: 512,
      zoomOffset: -1, attribution: osmAttrib
    });
    map.setView(new L.LatLng(51.0122995, 10.3995537), 7);
    map.addLayer(osmLayer);
  }

  async function loadData() {
    try {
      const response = await fetch("./locations.json");
      if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
      json = await response.json();

      json.forEach((location, index) => {
        if (location.loc && typeof location.loc.lat === 'number' && typeof location.loc.long === 'number') {
          location.uniqueId = 'loc-' + index;
          const marker = L.marker([location.loc.lat, location.loc.long], { icon: defaultIcon }).addTo(map);
          marker.uniqueId = location.uniqueId;
          marker.bindPopup(`<h3 id="style">${location.style}</h3><a id="titleurl" href="${location.link.url}" target="_blank"><h3>${location.name}</h3><br><br></a>${location.loc.street.name} ${location.loc.street.number}<span id="streetext">${location.loc.street.ext}</span><br><b>${zfill(location.loc.plz, location.loc.country)} ${location.loc.city}</b><br>${location.loc.country}<br><a id="url" href="${location.link.url}" target="_blank"><b>${location.link.text}</b></a>`);
          allMarkers.push(marker);
        }
      });
    } catch (error) {
      console.error("Error fetching or parsing locations.json:", error);
      alert("Failed to load location pins.");
    }
  }

  function setupSearch() {
    const searchBar = document.getElementById('search-bar');
    const suggestionsDropdown = document.getElementById('suggestions-dropdown');

    searchBar.addEventListener('keyup', () => {
      clearTimeout(zoomDebounceTimeout);
      const searchQuery = searchBar.value.toLowerCase();
      suggestionsDropdown.innerHTML = '';

      if (searchQuery.length < 1) {
        suggestionsDropdown.classList.remove('is-active');
        searchBar.classList.remove('has-suggestions');
        allMarkers.forEach(marker => marker.setIcon(defaultIcon));
        return;
      }

      const filteredLocations = json.filter(location =>
        location.name.toLowerCase().includes(searchQuery) ||
        zfill(location.loc.plz, location.loc.country).startsWith(searchQuery) ||
        location.loc.city.toLowerCase().includes(searchQuery)
      );

      const filteredIds = new Set(filteredLocations.map(loc => loc.uniqueId));
      allMarkers.forEach(marker => {
        marker.setIcon(filteredIds.has(marker.uniqueId) ? highlightIcon : defaultIcon);
      });

      if (filteredLocations.length > 0) {
        suggestionsDropdown.classList.add('is-active');
        searchBar.classList.add('has-suggestions');
        filteredLocations.forEach(location => {
          const item = document.createElement('div');
          item.classList.add('suggestion-item');
          item.innerHTML = `<div class="item-name">${location.name}</div><div class="item-details">${location.loc.street.name} ${location.loc.street.number} ${location.loc.street.ext}</div><div class="item-details"><b>${zfill(location.loc.plz, location.loc.country)}</b> ${location.loc.city}</div>`;

          item.addEventListener('mouseover', () => {
            const targetMarker = allMarkers.find(m => m.uniqueId === location.uniqueId);
            if (targetMarker) targetMarker.setIcon(hoverIcon); // Use the LARGE black icon
          });
          item.addEventListener('mouseout', () => {
            const targetMarker = allMarkers.find(m => m.uniqueId === location.uniqueId);
            if (targetMarker) targetMarker.setIcon(highlightIcon); // Use the NORMAL red icon
          });

          item.addEventListener('click', () => {
            map.flyTo([location.loc.lat, location.loc.long], 15);
            const targetMarker = allMarkers.find(m => m.uniqueId === location.uniqueId);
            if (targetMarker) targetMarker.openPopup();
            searchBar.value = location.name;
            suggestionsDropdown.classList.remove('is-active');
            searchBar.classList.remove('has-suggestions');
          });

          suggestionsDropdown.appendChild(item);
        });
      } else {
        suggestionsDropdown.classList.remove('is-active');
        searchBar.classList.remove('has-suggestions');
      }

      if (filteredLocations.length > 0) {
        zoomDebounceTimeout = setTimeout(() => {
          const markersToZoom = filteredLocations.map(loc => allMarkers.find(m => m.uniqueId === loc.uniqueId)).filter(Boolean);

          suggestionsDropdown.classList.add('is-zooming');
          map.once('zoomend', () => {
            suggestionsDropdown.classList.remove('is-zooming');
          });

          if (markersToZoom.length > 1) {
            map.flyToBounds(L.featureGroup(markersToZoom).getBounds().pad(0.2));
          } else if (markersToZoom.length === 1) {
            map.flyTo(markersToZoom[0].getLatLng(), 13);
          }
        }, 1000);
      }
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-container')) {
        suggestionsDropdown.classList.remove('is-active');
        searchBar.classList.remove('has-suggestions');
      }
    });
  }

  function zfill(plz, country) {
    const expectedLengths = { Germany: 5, Austria: 4, Switzerland: 4, Poland: 5, USA: 5, Italy: 5, Spain: 5, France: 5, Luxemburg: 4, Netherlands: 4 };
    let plzStr = String(plz);
    let expectedLength = expectedLengths[country] || plzStr.length;
    return plzStr.padStart(expectedLength, "0");
  }

  initializeApp();
});