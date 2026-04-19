"""
Quick end-to-end test of the search-products Edge Function.
Run: python scripts/test_search.py
"""
import requests
import json
import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL  = os.environ["VITE_SUPABASE_URL"].rstrip("/")
ANON_KEY      = os.environ["VITE_SUPABASE_ANON_KEY"]

url     = f"{SUPABASE_URL}/functions/v1/search-products"
headers = {
    "Authorization": f"Bearer {ANON_KEY}",
    "Content-Type":  "application/json",
}

tests = [
    {"condition": "eczema",           "skin_type": "dry"},
    {"condition": "acne",             "skin_type": "oily"},
    {"condition": "hyperpigmentation","skin_type": "combination"},
    {"condition": "rosacea",          "skin_type": "normal"},
]

for t in tests:
    print(f"\n=== {t['condition']} ({t['skin_type']} skin) ===")
    resp = requests.post(url, headers=headers, json={**t, "match_count": 5}, timeout=30)
    print(f"Status: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        for p in data["products"]:
            print(
                f"  {p['rank']}. {p['name']} by {p['brand']}"
                f" | rating: {p['avg_rating']}"
                f" | similarity: {p['similarity']}"
                f" | url: {p['url']}"
            )
    else:
        print("Error:", resp.text[:400])
