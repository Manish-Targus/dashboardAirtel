#!/usr/bin/env python3
"""
Fetch GPS coordinates for Indian cities using Nominatim OpenStreetMap API.
Saves results to src/data/cityCoords.json
"""

import json
import time
import urllib.request
import urllib.parse
import urllib.error
import os

OUTPUT_PATH = "/home/altos/dashboard/src/data/cityCoords.json"
USER_AGENT = "airtel-network-map/1.0"
BASE_URL = "https://nominatim.openstreetmap.org/search"

# Cities organized by state
CITIES = {
    "Andhra Pradesh": [
        "ADDANKI", "ADONI", "AMALAPURAM", "ANAKAPALLE", "ANANTAPUR", "ANGALLU",
        "BADVEL", "BAPATLA", "BHIMAVARAM", "BOBBILI", "BUCHIREDDYPALEM",
        "CHILAKALURIPET", "CHIMAKURTHY", "CHITTOOR", "CUDDAPAH", "DHONE",
        "ELURU", "GIDDALUR", "GUDIVADA", "GUDUR", "GUNTAKAL", "GUNTUR",
        "HINDUPUR", "IBRAHIMPATNAM", "JAGGAIAHPET", "JAMMALAMADUGU",
        "JANGAREDDYGUDEM", "KADIRI", "KADIYAM", "KAKINADA", "KANDUKUR",
        "KANIGIRI", "KAVALI", "KODURU", "KOVUR", "KOVVUR", "KURNOOL",
        "MACHERLA", "MACHILIPATNAM", "MADANAPALLE", "MANDAPETA", "MANGALAGIRI",
        "MARKAPUR", "NAGARI", "NAIDUPETA", "NANDIGAMA", "NANDYAL", "NARASAPUR",
        "NARASARAOPET", "NELLORE", "NIDADAVOLE", "NUZVID", "ONGOLE", "PALAKOLLU",
        "PALAMANER", "PARIGI", "PARVATHIPURAM", "PENUKONDA", "PIDUGURALLA",
        "PILER", "PITHAPURAM", "PONNUR", "PRODDATUR", "PULIVENDULA", "PUNGANUR",
        "RAJAHMUNDRY", "RAJAM", "RAJAMPET", "RAMACHANDRAPURAM", "RAYACHOTI",
        "SALUR", "SAMALKOT", "SATTENAPALLE", "SINGARAYAKONDA", "SRIKAKULAM",
        "SRIKALAHASTI", "TADEPALLI", "TADEPALLIGUDEM", "TADIPATRI", "TANUKU",
        "TENALI", "TIRUPATHI", "TUNI", "VIJAYAWADA", "VINUKONDA",
        "VISAKHAPATNAM", "VIZIANAGARAM", "VUYYURU",
    ],
    "Bihar": [
        "ARARIA", "ARRAH", "BAGAHA", "BAKHTIYARPUR", "BANKA", "BARAUNI",
        "BARBIGHA", "BARH", "BEGUSARAI", "BENIPATTI", "BETTIAH", "BHABHUA",
        "BHAGALPUR", "BIDUPUR", "BIHARIGANJ", "BIHARSHARIF", "BIHTA",
        "BIKRAMGANJ", "BIRPUR", "BUXAR", "CHAPRA", "CHORSUA", "DALSINGHSARAI",
        "DANAPUR", "DARBHANGA", "DAUDNAGAR", "DEHRI ON SONE", "DUMRAON",
        "FATWAH", "FORBESHGANJ", "GAYA", "GOGRI JAMALPUR", "GOPALGANJ",
        "HAJIPUR", "HARNAUT", "JAHANABAD", "JALLEY", "JAMALPUR", "JAMUI",
        "JAYNAGAR", "JEHANABAD", "JHAJHA", "JHANJHARPUR", "KAHALGAON", "KANTI",
        "KATIHAR", "KHAGARIA", "KISHANGANJ", "KOCHAS", "KUDRA", "LAKHISARAI",
        "MADHEPURA", "MADHUBANI", "MAHUA", "MANER", "MASAURHI", "MIRGANJ",
        "MOTIHARI", "MUNGER", "MUZAFFARPUR", "NABINAGAR", "NALANDA", "NAUGACHIA",
        "NAWADA", "PATNA", "PIRO", "PUPRI", "PURNIA", "RAJGIR", "RAXAUL",
        "SAHARSA", "SAMASTIPUR", "SASARAM", "SHEIKHPURA", "SHEOHAR", "SHERGHATI",
        "SIMRI BAKHTIARPUR", "SITAMARHI", "SIWAN", "SONPUR", "SUPAUL", "TEGHRA",
        "TRIBENIGANJ",
    ],
    "Maharashtra": [
        "ACHALPUR", "AHMED NAGAR", "AHMEDPUR", "AJARA", "AKKALKOT", "AKLUJ",
        "AKOLA", "AKOLE", "AKOT", "ALEPHATA", "ALIBAG", "AMALNER", "AMBAD",
        "AMBARNATH", "AMBEJOGAI", "AMRAVATI", "ANJANGAON SURJI", "ATPADI",
        "AURANGABAD", "AUSA", "BADLAPUR", "BALLARPUR", "BARAMATI", "BARSHI",
        "BASMAT", "BEED", "BHADGAON", "BHAMBOLI", "BHOKARDAN", "BHUSAWAL",
        "BRAHMAPURI", "BULDHANA", "BUTIBORI", "CHAKUR", "CHALISGAON",
        "CHANDRAPUR", "CHANDWAD", "CHIKHALI", "CHIPLUN", "CHOPDA", "DAPOLI",
        "DAUND", "DEGLOOR", "DHULE", "DIGRAS", "DOMBIVALI", "FAIZPUR",
        "GADCHIROLI", "GADHINGLAJ", "GANGAKHED", "GONDIA", "HADGAON", "HINGNA",
        "HINGOLI", "HUPARI", "ICHALKARANJI", "INDAPUR", "JALGAON", "JALNA",
        "JATH", "JAYSINGPUR", "JUNNAR", "KALAMB", "KALYAN", "KAMPTEE",
        "KAMSHET", "KARAD", "KARANJA", "KHAMGAON", "KHED", "KHOPOLI",
        "KOLHAPUR", "KOPARGAON", "KORADI", "KOREGAON", "LATUR", "LONAND",
        "LONAVALA", "MAHABALESHWAR", "MAJALGAON", "MALEGAON", "MANGRULPIR",
        "MANMAD", "MAUDA", "MOHOL", "MUMBAI", "MUMBRA", "MURTIZAPUR", "MURUD",
        "NAGPUR", "NANDED", "NANDGAON", "NANDURBAR", "NARAYANGAON", "NASHIK",
        "NATEPUTE", "NILANGA", "NIPHAD", "OSMANABAD", "OZAR", "PACHORA",
        "PALUS", "PANCHGANI", "PANDHARPUR", "PANVEL", "PARANDA", "PARATWADA",
        "PARBHANI", "PARLI", "PARTUR", "PATAN", "PHALTAN", "PIMPALGAON",
        "PUNE", "PURNA", "PUSAD", "RAHURI", "RAJURA", "RANJANGAON",
        "RATNAGIRI", "SANGAMNER", "SANGLI", "SANGOLA", "SAONER", "SASWAD",
        "SATARA", "SAVDA", "SAWANTWADI", "SELU", "SHAHADA", "SHEVGAON",
        "SHIKRAPUR", "SHIRPUR", "SHIRUR", "SILLOD", "SINNAR", "SOLAPUR",
        "TALEGAON DABHADE", "TALOJA", "TASGAON", "TEMBHURNI", "TRIMBAKESHWAR",
        "TULJAPUR", "UDGIR", "ULLHASNAGAR", "ULWE", "UMARGA", "URAN",
        "VAIJAPUR", "VITA", "WAI", "WANI", "WARDHA", "WARORA", "WASHIM",
        "YAVATMAL", "YAWAL",
    ],
}

# Special search overrides: key -> (search_query, state)
# For cities with suffixes or special search strings
SPECIAL_SEARCH = {
    "AURANGABAD_BH": ("AURANGABAD BIHAR", "Bihar"),
    "JAGDISHPUR_BH": ("JAGDISHPUR BIHAR", "Bihar"),
    "KHARAGPUR_BH": ("KHARAGPUR BIHAR", "Bihar"),
    "NOKHA_BH": ("NOKHA BIHAR", "Bihar"),
    "RANIGANJ_BH": ("RANIGANJ BIHAR", "Bihar"),
    "ASHTA_MH": ("ASHTA MAHARASHTRA", "Maharashtra"),
    "BHADRAVATI_MH": ("BHADRAVATI MAHARASHTRA", "Maharashtra"),
}

# Hub coordinates
HUB_COORDS = {
    "ANDHRA PRADESH HUB": [16.5062, 80.6480],
    "BIHAR HUB": [25.5941, 85.1376],
    "MAHARASHTRA HUB": [18.5204, 73.8567],
}

# Fallback coordinates for regions (used if geocoding fails)
FALLBACK_COORDS = {
    "Andhra Pradesh": [15.9129, 79.7400],
    "Bihar": [25.0961, 85.3131],
    "Maharashtra": [19.7515, 75.7139],
}


def geocode(city_query: str, state: str) -> list | None:
    """Query Nominatim for a city. Returns [lat, lng] or None."""
    params = urllib.parse.urlencode({
        "q": f"{city_query},{state},India",
        "format": "json",
        "limit": "1",
    })
    url = f"{BASE_URL}?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
            if data:
                lat = round(float(data[0]["lat"]), 6)
                lng = round(float(data[0]["lon"]), 6)
                return [lat, lng]
    except urllib.error.HTTPError as e:
        print(f"  HTTP error {e.code} for: {city_query}, {state}")
    except urllib.error.URLError as e:
        print(f"  URL error for {city_query}, {state}: {e.reason}")
    except Exception as e:
        print(f"  Error for {city_query}, {state}: {e}")
    return None


def main():
    results = {}
    success = 0
    failed = 0
    fallback_used = 0
    failed_cities = []

    # Add hub coordinates first
    results.update(HUB_COORDS)

    total_cities = (
        sum(len(v) for v in CITIES.values()) + len(SPECIAL_SEARCH)
    )
    processed = 0

    # Process special search cities
    for key, (query, state) in SPECIAL_SEARCH.items():
        processed += 1
        print(f"[{processed}/{total_cities}] {key} -> '{query}, {state}'")
        coords = geocode(query, state)
        if coords:
            results[key] = coords
            success += 1
            print(f"  OK: {coords}")
        else:
            coords = FALLBACK_COORDS[state]
            results[key] = coords
            fallback_used += 1
            failed_cities.append(key)
            print(f"  FALLBACK: {coords}")
        time.sleep(1)

    # Process regular cities
    for state, cities in CITIES.items():
        for city in cities:
            processed += 1
            print(f"[{processed}/{total_cities}] {city}, {state}")
            coords = geocode(city, state)
            if coords:
                results[city] = coords
                success += 1
                print(f"  OK: {coords}")
            else:
                coords = FALLBACK_COORDS[state]
                results[city] = coords
                fallback_used += 1
                failed_cities.append(city)
                print(f"  FALLBACK: {coords}")
            time.sleep(1)

    # Save results
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print("\n" + "=" * 60)
    print(f"DONE. Total cities processed: {total_cities}")
    print(f"  Successfully geocoded: {success}")
    print(f"  Fallback coordinates used: {fallback_used}")
    print(f"  Hub entries added: {len(HUB_COORDS)}")
    print(f"  Total entries in JSON: {len(results)}")
    print(f"\nOutput saved to: {OUTPUT_PATH}")
    if failed_cities:
        print(f"\nCities using fallback coords ({len(failed_cities)}):")
        for c in failed_cities:
            print(f"  - {c}")


if __name__ == "__main__":
    main()
