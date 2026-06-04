import json
import math

def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2) * math.sin(dlat/2) + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2) * math.sin(dlon/2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

def load_json(filepath):
    with open(filepath, 'r') as f:
        return json.load(f)

flow_data = load_json('src/data/mobileNetFlowData.json')
city_coords = load_json('src/data/cityCoords.json')

ideal_flow = {}

for circle, links in flow_data.items():
    # Collect nodes and their tiers and total outgoing traffic
    nodes = {}
    for link in links:
        s, t = link['source'], link['target']
        st, tt = link['sourceTier'], link['targetTier']
        
        if s not in nodes: nodes[s] = {'tier': st, 'traffic_out': 0, 'traffic95_out': 0}
        if t not in nodes: nodes[t] = {'tier': tt, 'traffic_out': 0, 'traffic95_out': 0}
        
        # Only sum the raw traffic generated AT the source (approximate by summing outgoing traffic that is not from rerouting if possible? Or just take the sum of all outgoing links from T3)
        # Actually, T3 generates traffic, sends to T2. T2 aggregates and sends to T1.
        
    # Better: just collect the original generated traffic from each T3 and T2.
    # We can approximate generated traffic at node X as the sum of its outgoing traffic minus its incoming traffic.
    node_gen = {n: 0.0 for n in nodes}
    for link in links:
        node_gen[link['source']] += link['traffic']
        node_gen[link['target']] -= link['traffic']
    
    # Wait, traffic in this model might just be point-to-point. 
    # Let's just collect all T1, T2, T3.
    t1s = [n for n, d in nodes.items() if d['tier'] == 'T1']
    t2s = [n for n, d in nodes.items() if d['tier'] == 'T2']
    t3s = [n for n, d in nodes.items() if d['tier'] == 'T3']
    
    # Let's find coordinates
    def get_coords(city):
        if city in city_coords: return city_coords[city]
        if city.upper() in city_coords: return city_coords[city.upper()]
        return None
        
    ideal_links = []
    
    # For each T3, find closest T2
    for t3 in t3s:
        c1 = get_coords(t3)
        if not c1:
            # Fallback if no coords
            t2 = t2s[0] if t2s else t1s[0]
            ideal_links.append({'source': t3, 'target': t2, 'sourceTier': 'T3', 'targetTier': 'T2', 'traffic': 50, 'traffic95': 45, 'isRerouted': False})
            continue
            
        closest_t2 = None
        min_dist = float('inf')
        for t2 in t2s:
            c2 = get_coords(t2)
            if not c2: continue
            dist = haversine(c1[0], c1[1], c2[0], c2[1])
            if dist < min_dist:
                min_dist = dist
                closest_t2 = t2
                
        if not closest_t2 and t1s:
            closest_t2 = t1s[0]
            
        ideal_links.append({'source': t3, 'target': closest_t2, 'sourceTier': 'T3', 'targetTier': 'T2' if closest_t2 in t2s else 'T1', 'traffic': 50, 'traffic95': 45, 'isRerouted': False})
        
    # For each T2, find closest T1
    for t2 in t2s:
        c1 = get_coords(t2)
        if not c1:
            t1 = t1s[0] if t1s else t2
            ideal_links.append({'source': t2, 'target': t1, 'sourceTier': 'T2', 'targetTier': 'T1', 'traffic': 200, 'traffic95': 180, 'isRerouted': False})
            continue
            
        closest_t1 = None
        min_dist = float('inf')
        for t1 in t1s:
            c2 = get_coords(t1)
            if not c2: continue
            dist = haversine(c1[0], c1[1], c2[0], c2[1])
            if dist < min_dist:
                min_dist = dist
                closest_t1 = t1
                
        if closest_t1:
            ideal_links.append({'source': t2, 'target': closest_t1, 'sourceTier': 'T2', 'targetTier': 'T1', 'traffic': 200, 'traffic95': 180, 'isRerouted': False})

    ideal_flow[circle] = ideal_links

with open('src/data/mobileIdealFlowData.json', 'w') as f:
    json.dump(ideal_flow, f, indent=2)
print("Done")
