const fs = require('fs');
const data = JSON.parse(fs.readFileSync('src/data/airtelNetworkData.json'));

const cityCoords = new Map();
let diffCoords = false;

for (const [circleName, circleData] of Object.entries(data)) {
  for (const city of circleData.cities) {
    if (cityCoords.has(city.name)) {
      const existing = cityCoords.get(city.name);
      if (existing.lat !== city.lat || existing.lng !== city.lng) {
        console.log(`Mismatch for ${city.name}: (${existing.lat}, ${existing.lng}) vs (${city.lat}, ${city.lng})`);
        diffCoords = true;
      }
    } else {
      cityCoords.set(city.name, { lat: city.lat, lng: city.lng });
    }
  }
}
if (!diffCoords) console.log("All cities with the same name have the same coordinates.");
