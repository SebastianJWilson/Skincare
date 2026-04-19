"""
Skincare product ingestion script
----------------------------------
Reads product_info.csv + all reviews CSVs, cleans and aggregates the data,
generates embeddings locally using sentence-transformers (gte-small, 384 dims),
then upserts everything into the skincare_products table via Supabase REST API.

Requirements:
    pip install pandas requests python-dotenv tqdm sentence-transformers

Usage:
    python scripts/ingest_products.py
"""

import os
import ast
import glob
import time
import json
import requests
import pandas as pd
from tqdm import tqdm
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer

load_dotenv()

SUPABASE_URL         = os.environ["VITE_SUPABASE_URL"].rstrip("/")
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
PRODUCT_CSV          = os.environ.get("PRODUCT_CSV",  r"D:\Coding projects\Skincare\product_info.csv")
REVIEWS_DIR          = os.environ.get("REVIEWS_DIR",  r"D:\Coding projects\Skincare")

EMBED_BATCH_SIZE  = 64   # sentence-transformers handles this locally — can be larger
UPSERT_BATCH_SIZE = 50   # rows per Supabase REST upsert call

# ---------------------------------------------------------------------------
# 1. Load & filter products
# ---------------------------------------------------------------------------
print("Loading products...")
products = pd.read_csv(PRODUCT_CSV)
print(f"  Total products: {len(products)}")

skincare = products[products["primary_category"] == "Skincare"].copy()
print(f"  Skincare products: {len(skincare)}")

skincare = skincare.dropna(subset=["product_name", "brand_name"])
skincare["rating"]    = pd.to_numeric(skincare["rating"],    errors="coerce")
skincare["price_usd"] = pd.to_numeric(skincare["price_usd"], errors="coerce")
skincare["reviews"]   = pd.to_numeric(skincare["reviews"],   errors="coerce").fillna(0).astype(int)

def parse_list_field(val):
    if pd.isna(val) or not str(val).strip():
        return ""
    try:
        items = ast.literal_eval(str(val))
        if isinstance(items, list):
            return " | ".join(str(i).strip() for i in items if i)
    except Exception:
        pass
    return str(val).strip()

skincare["highlights_clean"]   = skincare["highlights"].apply(parse_list_field)
skincare["ingredients_clean"]  = skincare["ingredients"].apply(parse_list_field)

print(f"  After cleaning: {len(skincare)} products")

# ---------------------------------------------------------------------------
# 2. Load & aggregate reviews
# ---------------------------------------------------------------------------
print("\nLoading reviews...")
review_files = sorted(glob.glob(os.path.join(REVIEWS_DIR, "reviews_*.csv")))
print(f"  Found {len(review_files)} review files")

dfs = []
for f in review_files:
    df = pd.read_csv(f, low_memory=False)
    df = df.loc[:, ~df.columns.str.match(r"^Unnamed")]
    dfs.append(df)

reviews = pd.concat(dfs, ignore_index=True)
print(f"  Total reviews loaded: {len(reviews):,}")

skincare_ids = set(skincare["product_id"].unique())
reviews = reviews[reviews["product_id"].isin(skincare_ids)].copy()
print(f"  Reviews for skincare products: {len(reviews):,}")

reviews["rating"]         = pd.to_numeric(reviews["rating"],         errors="coerce")
reviews["is_recommended"] = pd.to_numeric(reviews["is_recommended"], errors="coerce")
reviews["skin_type"]      = reviews["skin_type"].fillna("").str.strip().str.lower()
reviews["review_text"]    = reviews["review_text"].fillna("").str.strip()
reviews["total_pos_feedback_count"] = pd.to_numeric(
    reviews.get("total_pos_feedback_count", 0), errors="coerce"
).fillna(0)

print("  Aggregating reviews per product...")
agg = reviews.groupby("product_id").agg(
    review_count   = ("rating", "count"),
    avg_rating     = ("rating", "mean"),
    recommend_rate = ("is_recommended", lambda x: round(x.dropna().mean() * 100, 1) if x.dropna().any() else None),
).reset_index()

skin_type_ratings = (
    reviews[reviews["skin_type"].isin(["dry", "oily", "combination", "normal"])]
    .groupby(["product_id", "skin_type"])["rating"]
    .mean().round(2).reset_index()
)
skin_type_pivot = skin_type_ratings.pivot(
    index="product_id", columns="skin_type", values="rating"
).reset_index()

def top_reviews_for_product(group):
    has_text = group[group["review_text"].str.len() > 30].copy()
    if has_text.empty:
        has_text = group.copy()
    has_text = has_text.sort_values(
        ["total_pos_feedback_count", "rating"], ascending=[False, False]
    ).head(3)
    return [
        {
            "skin_type": row["skin_type"] or "unknown",
            "rating":    int(row["rating"]) if pd.notna(row["rating"]) else None,
            "text":      row["review_text"][:300],
        }
        for _, row in has_text.iterrows()
    ]

print("  Extracting top reviews per product...")
top_reviews_map = (
    reviews.groupby("product_id")
    .apply(top_reviews_for_product, include_groups=False)
    .to_dict()
)

# ---------------------------------------------------------------------------
# 3. Merge
# ---------------------------------------------------------------------------
print("\nMerging product + review data...")
merged = skincare.merge(agg,              on="product_id", how="left")
merged = merged.merge(skin_type_pivot,    on="product_id", how="left")
merged["final_rating"] = merged["avg_rating"].combine_first(merged["rating"])
merged["sephora_url"]  = merged["product_id"].apply(
    lambda pid: f"https://www.sephora.com/product/{pid}" if pid else None
)
print(f"  Merged dataset: {len(merged)} products")

# ---------------------------------------------------------------------------
# 4. Build embedding text
# ---------------------------------------------------------------------------
def build_embedding_text(row):
    parts = [
        f"{row['product_name']} by {row['brand_name']}",
        f"Category: {row.get('secondary_category', '')} {row.get('tertiary_category', '')}".strip(),
    ]
    if row.get("highlights_clean"):
        parts.append(f"Highlights: {row['highlights_clean']}")
    if pd.notna(row.get("final_rating")):
        parts.append(f"Rating: {row['final_rating']:.1f}/5")
    rc = row.get("review_count_x") or row.get("review_count_y") or 0
    if rc:
        parts.append(f"Reviews: {int(rc)}")
    if pd.notna(row.get("recommend_rate")):
        parts.append(f"Recommended by {row['recommend_rate']:.0f}% of users")
    skin_notes = []
    for st in ["dry", "oily", "combination", "normal"]:
        if st in row and pd.notna(row.get(st)):
            skin_notes.append(f"{st} skin: {row[st]:.1f}/5")
    if skin_notes:
        parts.append("Skin type ratings: " + ", ".join(skin_notes))
    return ". ".join(p for p in parts if p)

merged["embedding_text"] = merged.apply(build_embedding_text, axis=1)

# ---------------------------------------------------------------------------
# 5. Generate embeddings locally with sentence-transformers (gte-small)
# ---------------------------------------------------------------------------
print("\nLoading gte-small model locally...")
model = SentenceTransformer("thenlper/gte-small")   # 384 dims — same as Supabase AI

texts = merged["embedding_text"].tolist()
print(f"Generating embeddings for {len(texts)} products (batch size {EMBED_BATCH_SIZE})...")

all_embeddings = []
for i in tqdm(range(0, len(texts), EMBED_BATCH_SIZE)):
    batch = texts[i : i + EMBED_BATCH_SIZE]
    vecs  = model.encode(batch, normalize_embeddings=True, show_progress_bar=False)
    all_embeddings.extend(vecs.tolist())

merged["embedding"] = all_embeddings
print(f"  Embeddings generated: {len(all_embeddings)}")

# ---------------------------------------------------------------------------
# 6. Upsert into Supabase
# ---------------------------------------------------------------------------
UPSERT_URL = f"{SUPABASE_URL}/rest/v1/skincare_products"
headers = {
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "apikey":        SUPABASE_SERVICE_KEY,
    "Content-Type":  "application/json",
    "Prefer":        "resolution=merge-duplicates",
}

def build_row(row):
    pid = row["product_id"]
    st_ratings = {}
    for st in ["dry", "oily", "combination", "normal"]:
        if st in row and pd.notna(row.get(st)):
            st_ratings[st] = round(float(row[st]), 2)

    rc = row.get("review_count_x") or row.get("review_count_y") or 0

    return {
        "product_id":         pid,
        "product_name":       str(row["product_name"]),
        "brand_name":         str(row["brand_name"]),
        "price_usd":          float(row["price_usd"])          if pd.notna(row.get("price_usd"))      else None,
        "secondary_category": str(row["secondary_category"])   if pd.notna(row.get("secondary_category")) else None,
        "tertiary_category":  str(row["tertiary_category"])    if pd.notna(row.get("tertiary_category"))  else None,
        "highlights":         str(row["highlights_clean"])     if row.get("highlights_clean")          else None,
        "ingredients":        str(row["ingredients_clean"])[:2000] if row.get("ingredients_clean")    else None,
        "avg_rating":         round(float(row["final_rating"]), 2) if pd.notna(row.get("final_rating")) else None,
        "review_count":       int(rc)                          if pd.notna(rc)                         else 0,
        "recommend_rate":     float(row["recommend_rate"])     if pd.notna(row.get("recommend_rate"))  else None,
        "skin_type_ratings":  st_ratings                       if st_ratings                           else None,
        "top_reviews":        top_reviews_map.get(pid, []),
        "sephora_url":        row["sephora_url"],
        "embedding_text":     row["embedding_text"],
        "embedding":          row["embedding"],
    }

rows_list = merged.to_dict("records")
print(f"\nUpserting {len(rows_list)} rows to Supabase in batches of {UPSERT_BATCH_SIZE}...")

success_count = 0
error_count   = 0

for i in tqdm(range(0, len(rows_list), UPSERT_BATCH_SIZE)):
    batch   = rows_list[i : i + UPSERT_BATCH_SIZE]
    payload = []
    for row in batch:
        try:
            payload.append(build_row(row))
        except Exception as e:
            print(f"\n  Row build error for {row.get('product_id')}: {e}")
            error_count += 1

    if not payload:
        continue

    try:
        resp = requests.post(UPSERT_URL, headers=headers, json=payload, timeout=30)
        resp.raise_for_status()
        success_count += len(payload)
    except Exception as e:
        print(f"\n  Upsert error batch {i}: {e}")
        if hasattr(e, "response") and e.response is not None:
            print(f"  Response: {e.response.text[:400]}")
        error_count += len(payload)

print(f"\nDone. Inserted/updated: {success_count}, errors: {error_count}")
