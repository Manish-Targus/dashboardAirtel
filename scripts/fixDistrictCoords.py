"""
Patches known-wrong coordinates in src/data/districtCircleMap.json.

These are districts whose stored lat/lng clearly belong to a different
state/district than the one their circle code implies (name collision
between same-named districts in different states).
"""

import json, os

# {DISTRICT_NAME: [correct_lat, correct_lng]}
CORRECTIONS: dict[str, list[float]] = {
    # West Bengal
    "HAORA":            [22.5843,  88.3096],   # Howrah — was stored in MP coords
    "HUGLI":            [22.8974,  88.3964],   # Hooghly — was stored in Karnataka
    "NADIA":            [23.4729,  88.5563],   # Nadia — was stored in Gujarat

    # Assam / North-East
    "UDALGURI":         [26.7519,  92.0950],   # Assam — was stored in Kerala
    "DARANG":           [26.4514,  91.7526],   # Darrang, Assam — was stored in Bihar
    "SONITPUR":         [26.6308,  92.8427],   # Tezpur, Assam — was stored in Bihar
    "BISHNUPUR":        [24.6210,  93.7698],   # Bishnupur, Manipur (NE) — was stored in WB
    "LAKHIMPUR":        [27.2326,  94.1042],   # Lakhimpur, Assam (NE) — was UP's Lakhimpur

    # Delhi
    "SHAHADARA":        [28.6730,  77.2921],   # Shahdara, Delhi — was stored in MH

    # Uttarakhand (UW circle)
    "CHAMOLI":          [30.4150,  79.3200],   # Chamoli, Uttarakhand — was stored in MH

    # Bihar
    "AURANGABAD":       [24.7506,  84.3700],   # Aurangabad, Bihar — was MH's Aurangabad
    "KAIMUR":           [25.0187,  83.5906],   # Kaimur, Bihar — was stored in WB
    "SARAN":            [25.9500,  84.8500],   # Saran, Bihar — was stored in MP/RJ area

    # Maharashtra
    "BHANDARA":         [21.1667,  79.6500],   # Bhandara, MH — was stored in HR
    "RAIGARH":          [18.5136,  73.1125],   # Raigad, MH — was stored as Raigarh CG

    # Jharkhand (BR circle)
    "PALAMU":           [23.8333,  84.5000],   # Palamu, Jharkhand — was stored in HP

    # Madhya Pradesh / Chhattisgarh (MP circle)
    "JASHPUR":          [22.9000,  84.1500],   # Jashpur, CG — was stored in UK
    "PANNA":            [24.7222,  80.1882],   # Panna, MP — was stored in Bihar
    "MANDLA":           [22.5967,  80.3728],   # Mandla, MP — was stored in KK
    "DINDORI":          [22.9500,  81.0800],   # Dindori, MP — was stored in GJ
    "NARMADAPURAM":     [22.7500,  77.7300],   # Hoshangabad/Narmadapuram, MP — was in AP
    "SHAJAPUR":         [23.4253,  76.2775],   # Shajapur, MP — was stored in KK
    "BIJAPUR":          [18.8218,  80.8200],   # Bijapur, CG (MP circle) — was KA's Bijapur

    # Odisha
    "NUAPARHA":         [20.8326,  82.5490],   # Nuapada, Odisha — was stored in UP

    # UP East
    "FATEHPUR":         [25.9300,  80.8100],   # Fatehpur, UP — was stored as RJ Fatehpur
    "HAMIRPUR":         [25.9500,  80.1500],   # Hamirpur, UP — was stored as HP Hamirpur
    "KHERI":            [27.9050,  80.7820],   # Lakhimpur Kheri, UP — was stored in RJ
}

def main() -> None:
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = os.path.join(base, "src", "data", "districtCircleMap.json")

    with open(path) as f:
        data: dict = json.load(f)

    patched = 0
    for district, (lat, lng) in CORRECTIONS.items():
        if district in data:
            old = data[district]
            data[district] = {"circle": old["circle"], "lat": lat, "lng": lng}
            patched += 1
            print(f"  Fixed {district}: ({old['lat']:.3f},{old['lng']:.3f}) → ({lat:.3f},{lng:.3f})")
        else:
            print(f"  WARN: {district} not in data")

    with open(path, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"\nPatched {patched} districts in {path}")


if __name__ == "__main__":
    main()
