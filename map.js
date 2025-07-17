var map;
var ajaxRequest;
var plotlist;
var plotlayers = [];

// Main Map Tile Layer from OpenStreetMap
async function initmap() {
  map = new L.Map('map');
  var osmUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  var osmAttrib = 'Map data © <a href="https://openstreetmap.org">OpenStreetMap</a> contributors';
  var osm = new L.TileLayer(osmUrl, { minZoom: 2, maxZoom: 19, attribution: osmAttrib });
  map.setView(new L.LatLng(51.0122995, 10.3995537), 7);
  map.addLayer(osm);









  // js fetch data from locations.json

  let response = await fetch("./locations.json");
  if (response.ok) {
    var json;
    // try {
      json = await response.json();
    // } catch (error) { json = null; }

  }


  // iterate over all json data

  for (let space of json) {

    // fetch one space
    var marker = L.marker([space.loc.lat, space.loc.long]).addTo(map);

    marker.bindPopup(`<h3 id="style">${space.style}</h3><a id="titleurl" href="${space.link.url}" target="_blank"><h3>${space.name}</h3><br><br></a>${space.loc.street}<br><b>${space.loc.plz} ${space.loc.city}</b><br>${space.loc.country}<br><a id="url" href="${space.link.url}" target="_blank"><b>${space.link.text}</b></a>`);
  }


  





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
    fillColor: 'blue',
    dashArray: '',
    fillOpacity: 0.08
  });
}

  

// Reset the country's style when the mouse leaves
function resetHighlight(e) {
  geojson.resetStyle(e.target);
}
  
// Zoom into the clicked country
function zoomToFeature(e) {
  map.fitBounds(e.target.getBounds(), { padding: [10, 10] });
}


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