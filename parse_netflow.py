import pandas as pd
import json

df = pd.read_excel('mobilenetflow.xlsx')
# Drop empty rows
df = df.dropna(subset=['Circle', 'City Name A', 'City Name B'])

result = {}
for index, row in df.iterrows():
    circle = row['Circle']
    if circle not in result:
        result[circle] = []
        
    result[circle].append({
        'source': row['City Name A'],
        'target': row['City Name B'],
        'sourceTier': row['Tier1'],
        'targetTier': row['Tier2'],
        'traffic': row['Link wise Peak Traffic(Gbps)'],
        'traffic95': row['Link wise 95% Traffic(Gbps)']
    })

with open('src/data/mobileNetFlowData.json', 'w') as f:
    json.dump(result, f, indent=2)

print("Parsed successfully!")
