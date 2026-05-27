"""
Aggregates mobileVolumeData.json (district-level 4G+5G TB volumes)
up to hub level using districtCircleMap.json coordinates + Haversine.

Output: src/data/hubVolumeData.json
{
  "dates": ["2026-04-22", ...],          # 31 dates
  "hubs": [
    {
      "hubCircle": "AP",
      "hubName":   "Hyderabad",
      "hubLat":    17.385,
      "hubLng":    78.487,
      "vals4g":    [123.4, 130.2, ...],  # TB per date
      "vals5g":    [45.1,  48.9,  ...],
      "districts": 12                    # how many districts feed this hub
    },
    ...
  ]
}
"""

import json, math, os

# ── Datacenter coordinates (same as MobileHubsMap HUBS) ──────────────────────
DATACENTERS: dict[str, dict[str, tuple[float, float]]] = {
    "AP": {"Hyderabad":(17.385,78.487),"Uppal":(17.406,78.559),"Vijayawada":(16.506,80.648)},
    "BR": {"Bhagalpur":(25.259,86.994),"Patliputra":(25.614,85.076),"Ranchi":(23.344,85.310)},
    "DL": {"Manesar":(28.367,76.932),"Noida":(28.535,77.391),"Noida81":(28.527,77.411)},
    "GJ": {"Ahmedabad":(23.023,72.571),"Rajkot":(22.304,70.802),"Surat":(21.170,72.831)},
    "JK": {"Jammu":(32.727,74.857),"Ludhiana":(30.901,75.857),"Mohali":(30.705,76.718),"Srinagar":(34.084,74.797)},
    "KK": {"Divyashree":(12.987,77.597),"Hosur Road":(12.840,77.677),"Mangalore":(12.914,74.856),"Whitefield":(12.970,77.750)},
    "KL": {"Calicut":(11.259,75.780),"Pollachi":(10.660,77.008)},
    "KN": {"Pollachi":(10.660,77.008),"Santhome":(13.034,80.279),"Siruseri":(12.801,80.222)},
    "KO": {"Infinity2":(22.556,88.402),"Kharagpur":(22.346,87.325)},
    "MH": {"E-Space":(18.566,73.915),"Nagpur":(21.146,79.088),"Pune":(18.520,73.857)},
    "MP": {"Bhopal":(23.260,77.413),"Jabalpur":(23.182,79.986),"Raipur":(21.251,81.630)},
    "MU": {"4D":(19.076,72.878),"Chandiwali":(19.114,72.908),"Spectrum":(19.100,72.920)},
    "NE": {"Guwahati":(26.145,91.736),"Jorhat":(26.747,94.203)},
    "OR": {"Bhubaneswar":(20.296,85.825)},
    "RJ": {"Jaipur":(26.912,75.787),"Jodhpur":(26.239,73.024),"Udaipur":(24.585,73.713)},
    "TN": {"Pollachi":(10.660,77.008),"Santhome":(13.034,80.279),"Siruseri":(12.801,80.222)},
    "UN": {"Ambala":(30.375,76.782),"Ludhiana":(30.901,75.857),"Manesar":(28.367,76.932),"Mohali":(30.705,76.718)},
    "UE": {"Gangaganj":(26.870,80.920),"Gomtinagar":(26.847,80.996),"Noida":(28.535,77.391),"Varanasi":(25.318,82.974)},
    "UW": {"Moradabad":(28.839,78.773),"Noida":(28.535,77.391),"Meerut":(28.985,77.706)},
    "WB": {"Kharagpur":(22.346,87.325),"Siliguri":(26.727,88.395)},
}

# Maps volume-data circle codes → hub circle codes
D2H: dict[str, str] = {
    "AP":"AP","AS":"NE","BR":"BR","CN":"KN","DL":"DL","GJ":"GJ",
    "HP":"UN","HR":"UN","JH":"BR","JK":"JK","KK":"KK","KL":"KL",
    "KO":"KO","MH":"MH","MP":"MP","MU":"MU","NE":"NE","OR":"OR",
    "PB":"UN","RJ":"RJ","TN":"TN","UE":"UE","UW":"UW","WB":"WB",
}

def haversine(lat1, lng1, lat2, lng2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1))*math.cos(math.radians(lat2))*math.sin(dlng/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

def nearest_hub(lat, lng, hub_circle):
    dcs = DATACENTERS.get(hub_circle, {})
    best, best_d = None, float('inf')
    for name, (dlat, dlng) in dcs.items():
        d = haversine(lat, lng, dlat, dlng)
        if d < best_d:
            best_d = d
            best = name
    return best

def main():
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    with open(os.path.join(base, "src/data/mobileVolumeData.json")) as f:
        vol = json.load(f)
    with open(os.path.join(base, "src/data/districtCircleMap.json")) as f:
        circle_map = json.load(f)

    dates    = vol["4g"]["dates"]
    n_dates  = len(dates)
    entries4 = vol["4g"]["entries"]
    entries5 = vol["5g"]["entries"]

    # Build district volume lookup: (circle, district) → values
    v4: dict[str, list] = {}
    v5: dict[str, list] = {}
    for e in entries4: v4[f'{e["circle"]}|{e["district"]}'] = e["values"]
    for e in entries5: v5[f'{e["circle"]}|{e["district"]}'] = e["values"]

    # hub key → aggregated stats
    hub_vals4: dict[str, list] = {}
    hub_vals5: dict[str, list] = {}
    hub_count: dict[str, int]  = {}

    matched = 0
    skipped = 0

    # Iterate volume entries; find each district's hub
    for e in entries4:
        dist_circle = e["circle"]
        district    = e["district"]
        hub_circle  = D2H.get(dist_circle)
        if not hub_circle:
            skipped += 1
            continue

        # Get district coords from circleMap (match by name)
        info = circle_map.get(district)
        if not info:
            skipped += 1
            continue

        hub_name = nearest_hub(info["lat"], info["lng"], hub_circle)
        if not hub_name:
            skipped += 1
            continue

        key = f'{hub_circle}::{hub_name}'
        if key not in hub_vals4:
            hub_vals4[key] = [0.0] * n_dates
            hub_vals5[key] = [0.0] * n_dates
            hub_count[key] = 0

        vals4_entry = v4.get(f'{dist_circle}|{district}', [None]*n_dates)
        vals5_entry = v5.get(f'{dist_circle}|{district}', [None]*n_dates)

        for i in range(n_dates):
            hub_vals4[key][i] += vals4_entry[i] or 0.0
            hub_vals5[key][i] += vals5_entry[i] or 0.0

        hub_count[key] += 1
        matched += 1

    print(f"Matched {matched} districts, skipped {skipped}")

    # Build output
    hubs_out = []
    for key, v4vals in hub_vals4.items():
        hub_circle, hub_name = key.split("::", 1)
        lat, lng = DATACENTERS[hub_circle][hub_name]
        hubs_out.append({
            "hubCircle":  hub_circle,
            "hubName":    hub_name,
            "hubLat":     lat,
            "hubLng":     lng,
            "vals4g":     [round(v, 2) for v in v4vals],
            "vals5g":     [round(v, 2) for v in hub_vals5[key]],
            "districts":  hub_count[key],
        })

    hubs_out.sort(key=lambda h: (h["hubCircle"], h["hubName"]))

    out = {"dates": dates, "hubs": hubs_out}
    dst = os.path.join(base, "src/data/hubVolumeData.json")
    with open(dst, "w") as f:
        json.dump(out, f, indent=2)

    print(f"Written {len(hubs_out)} hubs → {dst}")
    print("\nSample hubs:")
    for h in hubs_out[:5]:
        last4 = h["vals4g"][-1]
        last5 = h["vals5g"][-1]
        print(f"  {h['hubCircle']:4} {h['hubName']:12}  4G={last4:.1f} TB  5G={last5:.1f} TB  ({h['districts']} districts)")

if __name__ == "__main__":
    main()
