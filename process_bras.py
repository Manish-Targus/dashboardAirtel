#!/usr/bin/env python3
"""
Convert BRAS.xlsx → src/data/airtelNetworkData.json
Structure: Circle → hub (dominant BNG city) → OLT cities → BRAS → MSANs
"""

import json
import math
import openpyxl
from collections import defaultdict, Counter

XLSX_PATH = "/home/altos/dashboard/BRAS.xlsx"
COORDS_PATH = "/home/altos/dashboard/src/data/cityCoords.json"
OUTPUT_PATH = "/home/altos/dashboard/src/data/airtelNetworkData.json"

# BNG (data center) city coordinates
BNG_COORDS = {
    "portblare":         [11.6234,  92.7265],
    "Uppal":             [17.4056,  78.5600],
    "Vijaywada":         [16.5062,  80.6480],
    "Guwahati":          [26.1445,  91.7362],
    "Infinity- Kolkata": [22.5726,  88.3639],
    "Infinity-Kolkata":  [22.5726,  88.3639],
    "Ranchi":            [23.3441,  85.3096],
    "patna":             [25.5941,  85.1376],
    "Okhla":             [28.5355,  77.2500],
    "Bhopal":            [23.2599,  77.4126],
    "Raipur":            [21.2514,  81.6296],
    "Indore":            [22.7196,  75.8577],
    "Ahmedabad":         [23.0225,  72.5714],
    "Nagpur":            [21.1458,  79.0882],
    "Spectrum-Mumbai":   [19.0760,  72.8777],
    "Chadivali-Mumbai":  [19.0760,  72.8777],
    "Pune":              [18.5204,  73.8567],
    "Rakjot":            [22.3039,  70.8022],
    "Manesar":           [28.3580,  76.9320],
    "Ambala":            [30.3752,  76.7821],
    "Jaipur":            [26.9124,  75.7873],
    "Jammu":             [32.7266,  74.8570],
    "Srinagar":          [34.0837,  74.7973],
    "Jodhpur":           [26.2389,  73.0243],
    "Ludhiana":          [30.9010,  75.8573],
    "Mohali ":           [30.7046,  76.7179],
    "Lucknow":           [26.8467,  80.9462],
    "Varanasi":          [25.3176,  82.9739],
    "Merrut":            [28.9845,  77.7064],
    "Moradabad":         [28.8386,  78.7733],
    "Noida":             [28.5355,  77.3910],
    "Kharagpur":         [22.3460,  87.2320],
    "Manglore":          [12.9141,  74.8560],
    "Calicut":           [11.2588,  75.7804],
    "Pollachi":          [10.6590,  77.0070],
    "Santhome-Chennai":  [13.0358,  80.2765],
    "serisuri- Chennai": [13.0827,  80.2707],
    "Bhubneshwar":       [20.2961,  85.8245],
    "banglore":          [12.9716,  77.5946],
}

# Color palette for 35 circles
COLORS = [
    "#22d3ee", "#4ade80", "#a78bfa", "#f87171", "#fb923c",
    "#facc15", "#34d399", "#60a5fa", "#e879f9", "#f472b6",
    "#38bdf8", "#a3e635", "#fb7185", "#c084fc", "#2dd4bf",
    "#fbbf24", "#f97316", "#84cc16", "#06b6d4", "#8b5cf6",
    "#10b981", "#ef4444", "#3b82f6", "#ec4899", "#14b8a6",
    "#f59e0b", "#6366f1", "#22c55e", "#e11d48", "#0ea5e9",
    "#d946ef", "#64748b", "#0891b2", "#16a34a", "#7c3aed",
]


def haversine(lat1, lng1, lat2, lng2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng/2)**2
    return round(R * 2 * math.asin(math.sqrt(a)), 1)


def load_coords():
    with open(COORDS_PATH) as f:
        return json.load(f)


def get_city_coords(city_name, coords_db):
    key = city_name.upper()
    if key in coords_db:
        return coords_db[key]
    # Try title case
    if city_name in coords_db:
        return coords_db[city_name]
    return None


def main():
    print("Reading BRAS.xlsx...")
    wb = openpyxl.load_workbook(XLSX_PATH)
    ws = wb['raw ']

    coords_db = load_coords()
    # Add BNG city coords to lookup (uppercase keys)
    for bng, latln in BNG_COORDS.items():
        coords_db[bng.upper()] = latln
    # Also normalize existing coords keys for lookup
    coords_upper = {k.upper(): v for k, v in coords_db.items()}

    # Parse all rows: group by circle → (olt_city, bng_city) → bras → msans
    # Each (olt_city, bng_city) pair is a separate connection entry
    print("Parsing rows...")
    # Structure: circle_data[circle][(olt_city, bng_city)]["bras"][bras_name] = [msans]
    circle_data = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    circle_bng_counter = defaultdict(Counter)

    row_count = 0
    for row in ws.iter_rows(min_row=2, min_col=1, max_col=7, values_only=True):
        msan, vlan, count, circle, olt_city, bras_name, bng_city = row
        if msan is None:
            break
        row_count += 1

        olt_city = olt_city.strip().upper()

        circle_bng_counter[circle][bng_city] += 1

        circle_data[circle][(olt_city, bng_city)][bras_name].append({
            "msan": str(msan),
            "vlan": str(vlan),
            "count": int(count) if count else 0
        })

    print(f"Parsed {row_count} rows across {len(circle_data)} circles")

    # Build output JSON
    output = {}
    missing_coords = []

    for color_idx, circle in enumerate(sorted(circle_data.keys())):
        conn_map = circle_data[circle]  # key: (olt_city, bng_city)

        # Dominant BNG city = hub
        dominant_bng = circle_bng_counter[circle].most_common(1)[0][0]
        hub_coords = BNG_COORDS.get(dominant_bng)
        if hub_coords is None:
            hub_coords = coords_upper.get(dominant_bng.upper(), [0.0, 0.0])

        color = COLORS[color_idx % len(COLORS)]

        # Build cities list — one entry per (olt_city, bng_city) pair
        cities_list = []
        for (olt_city, bng_city), bras_dict in sorted(conn_map.items()):
            # BNG city coords
            bng_coords = BNG_COORDS.get(bng_city) or coords_upper.get(bng_city.upper(), hub_coords)
            bng_lat, bng_lng = bng_coords

            # OLT city coords
            city_coords = coords_upper.get(olt_city.upper())
            if city_coords is None:
                city_coords = bng_coords
                missing_coords.append(f"{olt_city} ({circle})")

            city_lat, city_lng = city_coords

            dist = haversine(bng_lat, bng_lng, city_lat, city_lng)

            # Build BRAS list
            bras_list = []
            total_count = 0
            for bras_name, msans in sorted(bras_dict.items()):
                bras_list.append({"bras": bras_name, "msans": msans})
                total_count += sum(m["count"] for m in msans)

            cities_list.append({
                "name": olt_city,
                "bngCity": bng_city,
                "bngCityLat": round(bng_lat, 6),
                "bngCityLng": round(bng_lng, 6),
                "lat": round(city_lat, 6),
                "lng": round(city_lng, 6),
                "distanceKm": dist,
                "totalCount": total_count,
                "brasCount": len(bras_list),
                "bras": bras_list
            })

        output[circle] = {
            "hub": dominant_bng,
            "lat": round(hub_coords[0], 4),
            "lng": round(hub_coords[1], 4),
            "color": color,
            "cities": cities_list
        }
        print(f"  {circle}: hub={dominant_bng}, {len(cities_list)} OLT cities")

    # Write output
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\nOutput written to {OUTPUT_PATH}")
    print(f"Total circles: {len(output)}")
    print(f"OLT cities without exact coords (using fallback): {len(missing_coords)}")
    if missing_coords[:10]:
        print("  First 10:", missing_coords[:10])


if __name__ == "__main__":
    main()
