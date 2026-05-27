"""
Generates src/data/districtHubMapping.json

For every district in districtCircleMap.json, finds the nearest datacenter
within the same circle code (using the xlsx circle codes as the canonical set).

Output format:
{
  "DISTRICT_NAME": {
    "lat": float,
    "lng": float,
    "hubCircle": str,   # xlsx circle code (AP / BR / NE / UN …)
    "hubName": str,     # datacenter name
    "hubLat": float,
    "hubLng": float,
    "distKm": float
  },
  ...
}
"""

import json, math, os

# ---------------------------------------------------------------------------
# Datacenter coordinates (from MobileHubsMap.tsx HUBS array)
# Circle codes match the xlsx exactly.
# ---------------------------------------------------------------------------
DATACENTERS: dict[str, dict[str, tuple[float, float]]] = {
    "AP": {
        "Hyderabad":  (17.385, 78.487),
        "Uppal":      (17.406, 78.559),
        "Vijayawada": (16.506, 80.648),
    },
    "BR": {
        "Bhagalpur":  (25.259, 86.994),
        "Patliputra": (25.614, 85.076),
        "Ranchi":     (23.344, 85.310),
    },
    "DL": {
        "Manesar":    (28.367, 76.932),
        "Noida":      (28.535, 77.391),
        "Noida81":    (28.527, 77.411),
    },
    "GJ": {
        "Ahmedabad":  (23.023, 72.571),
        "Rajkot":     (22.304, 70.802),
        "Surat":      (21.170, 72.831),
    },
    "JK": {
        "Jammu":      (32.727, 74.857),
        "Ludhiana":   (30.901, 75.857),
        "Mohali":     (30.705, 76.718),
        "Srinagar":   (34.084, 74.797),
    },
    "KK": {
        "Divyashree": (12.987, 77.597),
        "Hosur Road": (12.840, 77.677),
        "Mangalore":  (12.914, 74.856),
        "Whitefield": (12.970, 77.750),
    },
    "KL": {
        "Calicut":    (11.259, 75.780),
        "Pollachi":   (10.660, 77.008),
    },
    "KN": {
        "Pollachi":   (10.660, 77.008),
        "Santhome":   (13.034, 80.279),
        "Siruseri":   (12.801, 80.222),
    },
    "KO": {
        "Infinity2":  (22.556, 88.402),
        "Kharagpur":  (22.346, 87.325),
    },
    "MH": {
        "E-Space":    (18.566, 73.915),
        "Nagpur":     (21.146, 79.088),
        "Pune":       (18.520, 73.857),
    },
    "MP": {
        "Bhopal":     (23.260, 77.413),
        "Jabalpur":   (23.182, 79.986),
        "Raipur":     (21.251, 81.630),
    },
    "MU": {
        "4D":         (19.076, 72.878),
        "Chandiwali": (19.114, 72.908),
        "Spectrum":   (19.100, 72.920),
    },
    "NE": {
        "Guwahati":   (26.145, 91.736),
        "Jorhat":     (26.747, 94.203),
    },
    "OR": {
        "Bhubaneswar": (20.296, 85.825),
    },
    "RJ": {
        "Jaipur":     (26.912, 75.787),
        "Jodhpur":    (26.239, 73.024),
        "Udaipur":    (24.585, 73.713),
    },
    "TN": {
        "Pollachi":   (10.660, 77.008),
        "Santhome":   (13.034, 80.279),
        "Siruseri":   (12.801, 80.222),
    },
    "UN": {
        "Ambala":     (30.375, 76.782),
        "Ludhiana":   (30.901, 75.857),
        "Manesar":    (28.367, 76.932),
        "Mohali":     (30.705, 76.718),
    },
    "UE": {
        "Gangaganj":  (26.870, 80.920),
        "Gomtinagar": (26.847, 80.996),
        "Noida":      (28.535, 77.391),
        "Varanasi":   (25.318, 82.974),
    },
    "UW": {
        "Moradabad":  (28.839, 78.773),
        "Noida":      (28.535, 77.391),
        "Meerut":     (28.985, 77.706),
    },
    "WB": {
        "Kharagpur":  (22.346, 87.325),
        "Siliguri":   (26.727, 88.395),
    },
}

# Maps district-circle codes (in districtCircleMap.json) → hub circle codes (xlsx)
DISTRICT_TO_HUB_CIRCLE: dict[str, str] = {
    "AP": "AP",
    "AS": "NE",   # Assam is part of NE circle
    "BR": "BR",
    "CN": "KN",   # Chennai district-circle → KN hub circle
    "DL": "DL",
    "GJ": "GJ",
    "HP": "UN",   # Himachal Pradesh → UN (Punjab+Haryana)
    "HR": "UN",   # Haryana → UN
    "JH": "BR",   # Jharkhand → BR (Bihar circle)
    "JK": "JK",
    "KK": "KK",
    "KL": "KL",
    "KO": "KO",
    "MH": "MH",
    "MP": "MP",
    "MU": "MU",
    "NE": "NE",
    "OR": "OR",
    "PB": "UN",   # Punjab → UN
    "RJ": "RJ",
    "TN": "TN",
    "UE": "UE",
    "UW": "UW",
    "WB": "WB",
}


def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlng / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def main() -> None:
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    src  = os.path.join(base, "src", "data", "districtCircleMap.json")
    dst  = os.path.join(base, "src", "data", "districtHubMapping.json")

    with open(src) as f:
        district_map: dict = json.load(f)

    result: dict = {}
    skipped: list[str] = []

    for district, info in district_map.items():
        dist_circle: str = info["circle"]
        lat: float = info["lat"]
        lng: float = info["lng"]

        hub_circle = DISTRICT_TO_HUB_CIRCLE.get(dist_circle)
        if hub_circle is None:
            skipped.append(f"{district} (unknown circle {dist_circle})")
            continue

        dcs = DATACENTERS.get(hub_circle)
        if not dcs:
            skipped.append(f"{district} (no DCs for hub circle {hub_circle})")
            continue

        # Find nearest datacenter within the hub circle
        best_name = ""
        best_dist = float("inf")
        best_lat = 0.0
        best_lng = 0.0

        for dc_name, (dc_lat, dc_lng) in dcs.items():
            d = haversine(lat, lng, dc_lat, dc_lng)
            if d < best_dist:
                best_dist = d
                best_name = dc_name
                best_lat  = dc_lat
                best_lng  = dc_lng

        result[district] = {
            "lat":       round(lat, 6),
            "lng":       round(lng, 6),
            "distCircle": dist_circle,
            "hubCircle": hub_circle,
            "hubName":   best_name,
            "hubLat":    best_lat,
            "hubLng":    best_lng,
            "distKm":    round(best_dist, 1),
        }

    with open(dst, "w") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    print(f"Written {len(result)} districts → {dst}")
    if skipped:
        print(f"Skipped {len(skipped)}: {skipped}")

    # Summary stats per hub circle
    from collections import Counter, defaultdict
    per_circle: dict = defaultdict(list)
    for v in result.values():
        per_circle[v["hubCircle"]].append(v["distKm"])

    print("\nDistricts per hub circle:")
    for circle in sorted(per_circle):
        dists = per_circle[circle]
        print(f"  {circle:6s}  {len(dists):3d} districts  "
              f"avg {sum(dists)/len(dists):.0f} km  max {max(dists):.0f} km")


if __name__ == "__main__":
    main()
