import base64
import urllib.request
import json

mermaid_code = "graph TD\nA-->B"
# mermaid.ink requires standard base64 encoding of JSON: {"code":"graph TD\nA-->B","mermaid":"{"theme":"default"}"}
# But actually mermaid.ink accepts just the base64 of the string!
b64 = base64.urlsafe_b64encode(mermaid_code.encode('utf-8')).decode('utf-8')
print("URL:", f"https://mermaid.ink/img/{b64}")

try:
    urllib.request.urlretrieve(f"https://mermaid.ink/img/{b64}", "test.png")
    print("Success downloading image")
except Exception as e:
    print("Error:", e)
