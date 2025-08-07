var map;
var json;
var allMarkers = [];
var zoomDebounceTimeout; // Variable to hold our timer

async function initmap() {
  map = new L.Map('map');
  var osmUrl = 'https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}{r}.png';
  var osmAttrib = '\u003ca href=\"https://www.stadiamaps.com\" target="_blank">Stadia Maps</a> &copy; <a href="https://openmaptiles.org" target="_blank">OpenMapTiles</a>';
  var osm = new L.TileLayer(osmUrl, {
    minZoom: 2, maxZoom: 19, tileSize: 512, attribution: osmAttrib, doubleClickZoom: true
  });
  map.setView(new L.LatLng(51.0122995, 10.3995537), 7);
  map.addLayer(osm);

  let response = await fetch("./locations.json");
  if (response.ok) {
    json = await response.json();
    json.forEach((location, index) => {
      location.uniqueId = 'loc-' + index;
    });
  }

  function zfill(plz, country) {
    const expectedLengths = { Germany: 5, Austria: 4, Switzerland: 4, Poland: 5, USA: 5, Italy: 5, Spain: 5, France: 5, Luxemburg: 4, Netherlands: 4 };
    let plzStr = plz.toString();
    if (!expectedLengths.hasOwnProperty(country)) { return plzStr; }
    let expectedLength = expectedLengths[country] || plzStr.length;
    return plzStr.padStart(expectedLength, "0");
  }

  function renderAllMarkers(locations) {
    for (let space of locations) {
      var marker = L.marker([space.loc.lat, space.loc.long]).addTo(map);
      marker.bindPopup(`<h3 id="style">${space.style}</h3><a id="titleurl" href="${space.link.url}" target="_blank"><h3>${space.name}</h3><br><br></a>${space.loc.street.name} ${space.loc.street.number}<span id="streetext">${space.loc.street.ext}</span><br><b>${zfill(space.loc.plz, space.loc.country)} ${space.loc.city}</b><br>${space.loc.country}<br><a id="url" href="${space.link.url}" target="_blank"><b>${space.link.text}</b></a>`);
      marker.uniqueId = space.uniqueId;
      allMarkers.push(marker);
    }
  }

  renderAllMarkers(json);

  // --- UPDATED SEARCH LOGIC WITH AUTO-ZOOM AND DYNAMIC STYLING ---

  const searchBar = document.getElementById('search-bar');
  const suggestionsDropdown = document.getElementById('suggestions-dropdown');

  searchBar.addEventListener('keyup', (e) => {
    // Clear the auto-zoom timer every time the user types
    clearTimeout(zoomDebounceTimeout);

    const searchQuery = e.target.value.toLowerCase();
    suggestionsDropdown.innerHTML = '';

    if (searchQuery.length < 1) {
      // Hide dropdown and remove active styles if search is empty
      searchBar.classList.remove('is-active');
      suggestionsDropdown.classList.remove('is-active');
      return;
    }

    const filteredLocations = json.filter(location => {
      const name = location.name.toLowerCase();
      const plz = zfill(location.loc.plz, location.loc.country).toLowerCase();
      const city = location.loc.city.toLowerCase();
      return name.includes(searchQuery) || plz.startsWith(searchQuery) || city.includes(searchQuery);
    });

    // If we have results, show the dropdown and style the search bar
    if (filteredLocations.length > 0) {
      searchBar.classList.add('is-active');
      suggestionsDropdown.classList.add('is-active');
    } else {
      searchBar.classList.remove('is-active');
      suggestionsDropdown.classList.remove('is-active');
    }

    filteredLocations.forEach(location => {
      const item = document.createElement('div');
      item.classList.add('suggestion-item');
      item.innerHTML = `<div class="item-name">${location.name}</div><div class="item-details">${zfill(location.loc.plz, location.loc.country)} ${location.loc.city}</div>`;
      item.addEventListener('click', () => {
        const targetMarker = allMarkers.find(m => m.uniqueId === location.uniqueId);
        if (targetMarker) {
          map.flyTo([location.loc.lat, location.loc.long], 15);
          targetMarker.openPopup();
        }
        searchBar.value = location.name;
        searchBar.classList.remove('is-active');
        suggestionsDropdown.classList.remove('is-active');
      });
      suggestionsDropdown.appendChild(item);
    });

    // **NEW**: Set the timer to auto-zoom after 1.5 seconds of inactivity
    if (filteredLocations.length > 0) {
      zoomDebounceTimeout = setTimeout(() => {
        const markersToZoom = filteredLocations.map(loc => {
          return allMarkers.find(m => m.uniqueId === loc.uniqueId);
        }).filter(m => m); // Filter out any undefined markers

        if (markersToZoom.length > 1) {
          const featureGroup = L.featureGroup(markersToZoom);
          map.flyToBounds(featureGroup.getBounds().pad(0.2)); // Pad adds nice margin
        } else if (markersToZoom.length === 1) {
          // If only one result, just fly to it
          map.flyTo(markersToZoom[0].getLatLng(), 13);
        }
      }, 1500); // 1.5 seconds delay
    }
  });

  // Hide dropdown if user clicks anywhere else
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
      searchBar.classList.remove('is-active');
      suggestionsDropdown.classList.remove('is-active');
    }
  });

  





// from https://medium.com/@limeira.felipe94/highlighting-countries-on-a-map-with-leaflet-f84b7efee0a9


// Main Map Tile Layer from OpenStreetMap
const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Style for countries on the main map
function style(feature) {
  return {
    fillColor: 'silver',
    weight: 1,
    opacity: 1,
    color: 'white',
    fillOpacity: 0.0
  };
}
  

// Highlight a country on hover
function highlightFeature(e) {
  const layer = e.target;
  layer.setStyle({
    weight: 6,
    color: 'blue',
    fffillColor: 'blue',
    dashArray: '',
    fillOpacity: 0.08
  });
}

  

// Reset the country's style when the mouse leaves
function resetHighlight(e) {
  geojson.resetStyle(e.target);
}
  
// Zoom into the clicked country
//
  //  DEACTIVATED  DEACTIVATED  DEACTIVATED  DEACTIVATED  DEACTIVATED  DEACTIVATED  DEACTIVATED  DEACTIVATED  
//
// function zoomToFeature(e) {
//   map.fitBounds(e.target.getBounds(), { padding: [10, 10] });
// }


// Define events for each feature (country)
function onEachFeature(feature, layer) {
  layer.on({
    mouseover: highlightFeature,
    mouseout: resetHighlight,
    click: zoomToFeature
  });
}



// Add GeoJSON data to the main map
let geojson;
fetch('data/countries.geojson')
  .then(response => response.json())
  .then(data => {
    geojson = L.geoJson(data, {
      style: style,
      onEachFeature: onEachFeature
    }).addTo(map);
  })
  .catch(error => {
    console.error('Error loading GeoJSON on the Main Map:', error);
  });
}


(async () => {
  initmap();
})()