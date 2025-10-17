import os
import json
import tempfile
import requests
import rasterio
import geopandas as gpd
from shapely.geometry import Point
import psycopg2
from dotenv import load_dotenv
from datetime import datetime, timedelta
import re

# ----------------------
# Load environment variables
# ----------------------
load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
AOI_GEOJSON_PATH = "idjwi.geojson"

if not DATABASE_URL:
    raise EnvironmentError("Missing DATABASE_URL environment variable.")

# ----------------------
# Get the correct GLAD URLs dynamically
# ----------------------
def get_glad_urls():
    base_url = "https://storage.googleapis.com/earthenginepartners-hansen/GLADalert/C2/current"
    coords = "020E_10S_030E_00N"
    current_year = datetime.now().year % 100  # e.g., 25, 26
    for year in [current_year, current_year - 1]:  # try this year, then last year
        alert_url = f"{base_url}/alert{year:02d}_{coords}.tif"
        alert_date_url = f"{base_url}/alertDate{year:02d}_{coords}.tif"
        resp = requests.head(alert_url)
        if resp.status_code == 200:
            print(f"✅ Using GLAD dataset year 20{year:02d}")
            return alert_url, alert_date_url, 2000 + year
    raise FileNotFoundError("❌ No valid GLAD alert file found for current or previous year.")

ALERT_TILE_URL, ALERT_DATE_TILE_URL, ALERT_YEAR = get_glad_urls()

# ----------------------
# Load AOI
# ----------------------
def load_aoi(aoi_path):
    geom = gpd.read_file(aoi_path).to_crs("EPSG:4326")
    return geom.unary_union

# ----------------------
# Download raster
# ----------------------
def download_raster(url):
    resp = requests.get(url)
    resp.raise_for_status()
    return resp.content

# ----------------------
# Convert rasters to centroids within AOI
# ----------------------
def rasters_to_centroids(alert_bytes, date_bytes, aoi_geom, alert_year):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".tif") as f_alert, \
         tempfile.NamedTemporaryFile(delete=False, suffix=".tif") as f_date:

        f_alert.write(alert_bytes)
        f_date.write(date_bytes)
        alert_path = f_alert.name
        date_path = f_date.name

    centroids = []
    with rasterio.open(alert_path) as alert_src, rasterio.open(date_path) as date_src:
        alert_arr = alert_src.read(1)
        date_arr = date_src.read(1)

        for row in range(alert_arr.shape[0]):
            for col in range(alert_arr.shape[1]):
                val = alert_arr[row, col]

                if val in [2, 3]:  # probable and confirmed
                    x, y = alert_src.xy(row, col)
                    day_of_year = int(date_arr[row, col])

                    if 0 < day_of_year <= 366:
                        alert_date = datetime(alert_year, 1, 1) + timedelta(days=day_of_year - 1)
                        pt = Point(x, y)

                        if aoi_geom.contains(pt):
                            centroids.append({
                                "geometry": pt,
                                "alert_value": int(val),
                                "alert_date": alert_date,
                                "loss_type": "confirmed" if val == 3 else "probable"
                            })

    return gpd.GeoDataFrame(centroids, crs="EPSG:4326")

# ----------------------
# Insert into Supabase/Postgres
# ----------------------
def insert_into_db(gdf):
    conn = psycopg2.connect(DATABASE_URL)
    gdf["geom_wkt"] = gdf.geometry.apply(lambda g: g.wkt)
    with conn.cursor() as cur:
        for _, row in gdf.iterrows():
            cur.execute(
                """
                INSERT INTO alerts (geom, alert_value, alert_date, loss_type)
                VALUES (ST_GeomFromText(%s, 4326), %s, %s, %s)
                ON CONFLICT (geom, alert_date) DO NOTHING;
                """,
                (row["geom_wkt"], row["alert_value"], row["alert_date"], row["loss_type"]),
            )
        conn.commit()
    conn.close()
    print(f"✅ Inserted {len(gdf)} alerts into Supabase.")

# ----------------------
# Main pipeline
# ----------------------
def main():
    print("📌 Loading AOI...")
    aoi_geom = load_aoi(AOI_GEOJSON_PATH)

    print("📌 Downloading latest GLAD alert and alertDate rasters...")
    alert_bytes = download_raster(ALERT_TILE_URL)
    date_bytes = download_raster(ALERT_DATE_TILE_URL)

    print("📌 Extracting centroids within AOI...")
    gdf = rasters_to_centroids(alert_bytes, date_bytes, aoi_geom, ALERT_YEAR)

    if gdf.empty:
        print("⚠️ No alerts found in AOI.")
    else:
        print("📌 Inserting alerts into Supabase...")
        insert_into_db(gdf)

    print("🏁 Pipeline completed!")

if __name__ == "__main__":
    main()
