#!/usr/bin/env python3
"""
Re-geocode OLT cities stuck on circle fallback coordinates.
Uses hardcoded coords for known cities, then Nominatim for the rest.
"""

import json, time, urllib.request, urllib.parse

COORDS_PATH = "/home/altos/dashboard/src/data/cityCoords.json"
USER_AGENT  = "airtel-network-map/1.0"
BASE_URL    = "https://nominatim.openstreetmap.org/search"

# (lat, lng) tuples that represent fallback / circle-center placeholder coords
FALLBACK_TUPLES = {
    (11.6234, 92.7265), (15.9129, 79.74),  (28.218,  94.7278),
    (26.2006, 92.9376), (25.0961, 85.3131), (21.2514, 81.6296),
    (20.1809, 73.0169), (15.2993, 74.124),  (22.2587, 71.1924),
    (29.0588, 76.0856), (31.1048, 77.1734), (33.7782, 76.5762),
    (23.6102, 85.2799), (15.3173, 75.7139), (10.8505, 76.2711),
    (34.1526, 77.577),  (22.9734, 78.6569), (19.7515, 75.7139),
    (24.6637, 93.9063), (25.467,  91.3662), (23.1645, 92.9376),
    (28.6139, 77.209),  (26.1584, 94.5624), (20.9517, 85.0985),
    (11.9416, 79.8083), (31.1471, 75.3412), (27.0238, 74.2179),
    (27.533,  88.5122), (11.1271, 78.6569), (17.1232, 79.2088),
    (23.9408, 91.9882), (26.8467, 80.9462), (28.7041, 77.1025),
    (30.0668, 79.0193), (22.9868, 87.855),
}

def is_fallback(lat, lng):
    return any(abs(lat - la) < 0.002 and abs(lng - lo) < 0.002 for (la, lo) in FALLBACK_TUPLES)

# State search suffix for Nominatim
STATE_SUFFIX = {
    "UP":  "Uttar Pradesh, India",
    "IN":  "India",
}

# Hardcoded correct coordinates for cities known to fail Nominatim lookup
KNOWN: dict[str, list] = {
    # ── Uttar Pradesh East ──────────────────────────────────────────────────
    "AKBARPUR":              [26.4333, 82.5333],
    "AKBARPUR_AMB":          [26.4333, 82.5333],
    "ALLAHABAD":             [25.4358, 81.8463],
    "AMETHI":                [26.1500, 81.9167],
    "ANPARA":                [24.1973, 82.7645],
    "ATARRA":                [25.0833, 80.5667],
    "AYODHYA":               [26.7922, 82.1998],
    "AZAMGARH":              [26.0727, 83.1837],
    "BABINA":                [25.2333, 78.4167],
    "BAHRAICH":              [27.5745, 81.5955],
    "BAKSHI KA TALAB":       [26.9500, 80.8167],
    "BALLIA":                [25.7600, 84.1467],
    "BALRAMPUR":             [27.4308, 82.1763],
    "BANDA":                 [25.4792, 80.3328],
    "BANSI":                 [27.1795, 82.9278],
    "BARABANKI":             [26.9371, 81.1947],
    "BARHALGANJ":            [26.4479, 83.6063],
    "BASTI":                 [26.8003, 82.7295],
    "BELTHARA ROAD":         [26.0833, 84.1667],
    "BHADOHI":               [25.3955, 82.5694],
    "BHATNI":                [26.3962, 83.9384],
    "CHANDAULI":             [25.2661, 83.2690],
    "CHHIBRAMAU":            [27.1400, 79.5006],
    "CHUNAR":                [25.1280, 82.8786],
    "COLONELGANJ":           [27.1500, 81.7000],
    "DEORIA":                [26.5032, 83.7802],
    "DOHRIGHAT":             [26.2647, 83.5154],
    "FAIZABAD":              [26.7737, 82.1392],
    "FARRUKHABAD":           [27.3963, 79.5800],
    "FATEHGARH":             [27.3683, 79.6307],
    "FATEHPUR_UPE":          [25.9284, 80.8180],
    "GHAZIPUR":              [25.5773, 83.5724],
    "GOLA GOKARAN NATH":     [27.9500, 80.4667],
    "GONDA":                 [27.1328, 81.9608],
    "GOPIGANJ":              [25.3003, 82.5196],
    "GORAKHPUR":             [26.7606, 83.3732],
    "HAMIRPUR_UP":           [25.9500, 80.1500],
    "HARDOI":                [27.3941, 80.1286],
    "JAGDISHPUR":            [26.0104, 81.1929],
    "JALAUN":                [26.1468, 79.3369],
    "JAUNPUR":               [25.7462, 82.6836],
    "JHANSI":                [25.4484, 78.5685],
    "KALPI":                 [26.1191, 79.7424],
    "KANNAUJ":               [27.0577, 79.9153],
    "KANPUR":                [26.4499, 80.3319],
    "KANPUR NAGAR":          [26.4499, 80.3319],
    "KAPTANGANJ":            [26.9167, 84.0333],
    "KUSHINAGAR":            [26.7399, 83.8890],
    "LAKHIMPUR":             [27.9500, 80.7810],
    "LALGANJ":               [25.8668, 82.3988],
    "LALITPUR":              [24.6887, 78.4143],
    "LUCKNOW":               [26.8467, 80.9462],
    "MAHARAJGANJ":           [27.1293, 83.5591],
    "MAHOBA":                [25.2900, 79.8690],
    "MAHRONI":               [24.5500, 78.7167],
    "MAUNATH":               [25.9167, 83.5500],
    "MAURANIPUR":            [25.2667, 79.1333],
    "MIRZAPUR":              [25.1459, 82.5690],
    "MOHAMMADABAD GOHNA":    [26.3167, 82.9000],
    "MOHANLALGANJ":          [26.7019, 80.9667],
    "MUGALSARAI":            [25.2845, 83.1185],
    "NANPARA":               [27.8642, 81.4990],
    "NAUTANWA":              [27.4259, 83.4150],
    "OBRA":                  [24.4532, 82.9868],
    "ORAI":                  [25.9926, 79.4507],
    "PADRAUNA":              [26.9052, 83.9797],
    "PALIA KALAN":           [28.4378, 80.5784],
    "PIPIGANJ":              [26.5833, 83.2667],
    "PUKHRAYAN":             [26.2333, 79.8333],
    "RAEBARELI":             [26.2330, 81.2354],
    "RASRA":                 [25.8556, 83.8500],
    "RATH":                  [25.5830, 79.5690],
    "RENUKOOT":              [24.2000, 83.0333],
    "RUDRAPUR_UPE":          [28.9845, 79.0193],
    "SAHJANWA":              [26.7333, 83.2167],
    "SALEMPUR":              [26.3160, 83.8720],
    "SANDILA":               [27.0674, 80.5204],
    "SANT KABIRNAGAR":       [26.7869, 82.9843],
    "SHAHABAD":              [27.6167, 79.9333],
    "SHAHGANJ":              [26.0500, 82.6833],
    "SHAHJAHANPUR":          [27.8830, 79.9050],
    "SHANKARGARH":           [25.1333, 81.5667],
    "SHRAWASTI":             [27.7000, 81.9000],
    "SIDDHARTHNAGAR":        [27.2964, 83.0916],
    "SITAPUR":               [27.5604, 80.6806],
    "SONBHADRA":             [24.6907, 82.9748],
    "SULTANPUR":             [26.2649, 82.0722],
    "TALBEHAT":              [25.2333, 79.2167],
    "TAMKUHI ROAD":          [26.8667, 83.9500],
    "TANDA":                 [26.5573, 82.5934],
    "UNCHAHAR":              [26.1079, 81.3583],
    "UNNAO":                 [26.5476, 80.4896],
    "UTRAULA":               [27.3213, 82.4108],
    # ── Uttar Pradesh West ──────────────────────────────────────────────────
    "AGRA":                  [27.1767, 78.0081],
    "ALIGARH":               [27.8974, 78.0880],
    "AMROHA":                [28.9000, 78.4667],
    "AONLA":                 [28.2667, 79.1500],
    "ATRAULI":               [28.0444, 78.2884],
    "AURAIYA":               [26.4644, 79.5114],
    "AURANGABAD_UP":         [25.2333, 84.3667],
    "BABRALA":               [28.3667, 78.6000],
    "BAGHPAT":               [28.9444, 77.2167],
    "BAHERI":                [28.7667, 79.5000],
    "BAHJOI":                [28.7167, 78.5167],
    "BARAUT":                [29.1000, 77.2667],
    "BAREILLY":              [28.3670, 79.4304],
    "BARSANA":               [27.6500, 77.3667],
    "BEHAT":                 [30.0333, 77.6667],
    "BEWAR":                 [26.9333, 79.0000],
    "BIJNOR":                [29.3667, 78.1333],
    "BISALPUR":              [28.2833, 79.7833],
    "BUDAUN":                [28.0444, 79.1268],
    "BULANDSHAHR":           [28.4000, 77.8500],
    "CHANDAUSI":             [28.4500, 78.7833],
    "CHANDPUR":              [29.1000, 78.2500],
    "DAURALA":               [29.0167, 77.6500],
    "DEOBAND":               [29.6984, 77.6816],
    "DHAMPUR":               [29.3167, 78.5000],
    "DHANAURA":              [28.8667, 78.6000],
    "DIBIYAPUR":             [26.5167, 79.6833],
    "ETAH":                  [27.5635, 78.6658],
    "ETAWAH":                [26.7754, 79.0208],
    "ETMADPUR":              [27.1333, 78.1333],
    "FARIDPUR":              [28.2167, 79.5667],
    "FATEHABAD_UPW":         [27.1119, 78.2327],
    "FIROZABAD":             [27.1500, 78.3957],
    "GAJRAULA":              [28.7500, 78.4167],
    "GANGOH":                [29.7833, 77.2500],
    "GULAOTHI":              [28.5333, 77.7833],
    "HAPUR":                 [28.7292, 77.7758],
    "HASTINAPUR":            [29.1667, 78.0167],
    "HATHRAS":               [27.5941, 78.0525],
    "JALESAR":               [27.4667, 78.3167],
    "JANSATH":               [29.3167, 77.8667],
    "JASRANA":               [27.2333, 78.5500],
    "JEWAR":                 [28.1167, 77.5500],
    "JHANGIRABAD":           [28.1333, 78.0500],
    "KAIRANA":               [29.3963, 77.2068],
    "KANTH":                 [29.0667, 78.6333],
    "KARHAL":                [27.0167, 79.0833],
    "KASGANJ":               [27.8017, 78.6450],
    "KHARKHODA_UPW":         [28.9185, 76.9029],
    "KHATAULI":              [29.2833, 77.7333],
    "KHEKRA":                [28.8667, 77.2833],
    "KHURJA":                [28.2500, 77.8500],
    "KIRATPUR":              [29.5500, 78.2000],
    "KUNDARKI":              [28.6000, 78.5833],
    "MAINPURI":              [27.2296, 79.0135],
    "MATHURA":               [27.4924, 77.6737],
    "MAWANA":                [29.1000, 77.8833],
    "MILAK":                 [28.6333, 79.3167],
    "MODINAGAR":             [28.8278, 77.5808],
    "MURADNAGAR":            [28.7700, 77.5067],
    "MUZAFFARNAGAR":         [29.4727, 77.7085],
    "NAGINA":                [29.4500, 78.4333],
    "NAJIBABAD":             [29.6000, 78.3667],
    "NARORA":                [28.1733, 78.3983],
    "NAWABGANJ":             [28.5333, 79.6500],
    "NEHTAUR":               [29.5000, 78.3167],
    "PILIBHIT":              [28.6319, 79.8025],
    "PILKHUWA":              [28.7167, 77.6667],
    "PURANPUR":              [28.5167, 80.1333],
    "RAMPUR":                [28.7930, 79.0028],
    "SADABAD":               [27.4333, 78.0500],
    "SAHARANPUR":            [29.9640, 77.5460],
    "SAMBHAL":               [28.5840, 78.5701],
    "SARDHANA":              [29.1500, 77.6167],
    "SARSAWA":               [29.7833, 77.4500],
    "SEOHARA":               [29.2167, 78.5833],
    "SHAMLI":                [29.4500, 77.3167],
    "SHAMSABAD":             [27.0833, 78.1000],
    "SHIKARPUR":             [28.2833, 78.0167],
    "SHIKOHABAD":            [27.1000, 78.5833],
    "SIKANDRABAD":           [28.4500, 77.7000],
    "SIRSAGANJ":             [27.0500, 78.6833],
    "SIYANA":                [28.6167, 77.9000],
    "TUNDLA":                [27.2167, 78.2333],
    "UJHANI":                [28.3667, 79.0000],
    # ── Other circles ───────────────────────────────────────────────────────
    "PORTBLAIR":             [11.6234, 92.7265],
    "BHABHUA":               [25.0500, 83.6000],
    "FORBESHGANJ":           [26.3000, 87.2667],
    "GOGRI JAMALPUR":        [25.4833, 86.5000],
    "RAIPUR":                [21.2514, 81.6296],
    "BAREJA":                [22.8167, 72.5500],
    "BILLIMORA":             [20.7667, 72.9833],
    "LUNAWADA":              [23.1333, 73.6167],
    "CHARKHIDADRI":          [28.5919, 75.9236],
    "ANANTHNAG":             [33.7311, 75.1481],
    "NAUSHERA":              [32.5333, 74.0667],
    "SINDGI":                [16.9167, 76.2333],
    "ALEPHATA":              [19.2333, 74.0667],
    "ULLHASNAGAR":           [19.2167, 73.1667],
    "HANSPAL":               [20.3500, 85.8667],
    "NURPUR BEDI":           [30.9667, 76.6167],
    "BAHROD":                [27.8167, 76.3333],
    "KOTPUTALI":             [27.6993, 75.8537],
    "NIMRANA":               [27.9833, 76.3833],
}


def nominatim(query: str, suffix: str):
    params = urllib.parse.urlencode({"q": f"{query},{suffix}", "format": "json", "limit": "1"})
    req = urllib.request.Request(f"{BASE_URL}?{params}", headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read().decode())
            if data:
                return [round(float(data[0]["lat"]), 6), round(float(data[0]["lon"]), 6)]
    except Exception as e:
        print(f"    err: {e}")
    return None


def main():
    with open(COORDS_PATH) as f:
        coords = json.load(f)

    to_fix = {k: v for k, v in coords.items() if is_fallback(v[0], v[1])}
    print(f"Entries stuck at fallback: {len(to_fix)}")

    fixed = 0
    failed = []

    for key, old_val in to_fix.items():
        upper = key.upper()

        if upper in KNOWN:
            coords[key] = KNOWN[upper]
            fixed += 1
            print(f"  [ok-hardcoded] {key}")
            continue

        # Try Nominatim — first with UP state, then India-wide
        print(f"  [nominatim] {key} ...", end=" ", flush=True)
        result = nominatim(key.title(), "Uttar Pradesh, India") \
              or nominatim(key.title(), "India")
        time.sleep(1)

        if result and not is_fallback(result[0], result[1]):
            coords[key] = result
            fixed += 1
            print(f"-> {result}")
        else:
            failed.append(key)
            print("FAILED")

    with open(COORDS_PATH, "w", encoding="utf-8") as f:
        json.dump(dict(sorted(coords.items())), f, indent=2, ensure_ascii=False)

    print(f"\nFixed {fixed}/{len(to_fix)} entries.")
    if failed:
        print(f"Still wrong ({len(failed)}): {', '.join(failed)}")


def is_fallback(lat, lng):
    return any(abs(lat - la) < 0.002 and abs(lng - lo) < 0.002 for (la, lo) in FALLBACK_TUPLES)


if __name__ == "__main__":
    main()
