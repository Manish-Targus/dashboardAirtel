import airtelData from '@/data/airtelNetworkData.json';

export type MsanRecord = { msan: string; vlan: string; count: number };
export type BrasEntry  = { bras: string; msans: MsanRecord[] };
export type AirtelCityData = {
  name: string; lat: number; lng: number;
  distanceKm: number; totalCount: number; brasCount: number;
  bngCity?: string; bngCityLat?: number; bngCityLng?: number;
  bras: BrasEntry[];
  complaints?: number;
};
export type AirtelCircleData = { hub: string; lat: number; lng: number; color: string; cities: AirtelCityData[] };

const processedAirtelData = JSON.parse(JSON.stringify(airtelData)) as Record<string, AirtelCircleData>;
const CIRCLE_NAMES = Object.keys(processedAirtelData);

const allOltCities: { circleName: string; city: AirtelCityData }[] = [];

for (const circleName of CIRCLE_NAMES) {
  for (const city of processedAirtelData[circleName].cities) {
    if (city.complaints === undefined) {
      const seed = city.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) + city.totalCount;
      if (seed % 4 === 0) {
        const fraction = (seed % 100) / 10000; // 0% to 0.99%
        city.complaints = Math.max(1, Math.floor(city.totalCount * fraction));
      } else {
        city.complaints = 0;
      }
    }
    allOltCities.push({ circleName, city });
  }
}

export { processedAirtelData, allOltCities, CIRCLE_NAMES };
