import os
import requests
from supabase import create_client
from datetime import date, timedelta

# ---------- CONFIG ----------
SUPABASE_URL = os.environ['SUPABASE_URL']
SUPABASE_KEY = os.environ['SUPABASE_KEY']
META_API_URL = f"https://graph.facebook.com/v17.0/{os.environ['PHONE_NUMBER_ID']}/messages"
ACCESS_TOKEN = os.environ['WHATSAPP_TOKEN']

# ---------- SUPABASE CLIENT ----------
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ---------- SUBSCRIBERS ----------
subscribers = supabase.table('subscribers').select('phone_number').execute().data

# ---------- LAST 7 DAYS ALERTS ----------
today = date.today()
seven_days_ago = today - timedelta(days=7)

alerts = supabase.table('alerts') \
    .select('geom, alert_date') \
    .gte('alert_date', seven_days_ago.isoformat()) \
    .lte('alert_date', today.isoformat()) \
    .execute().data

# ---------- FORMAT MESSAGE ----------
if alerts:
    message_text = f"🌳 Récapitulatif des alertes de déforestation sut l'île d'Idjwi ({seven_days_ago} → {today}):\n"
    message_text += f"📊 {len(alerts)} nouvelles alertes\n\n"
    message_text += "🗒️ Coordonnées des dernières alertes :\n"
    for alert in alerts:
        lon, lat = alert['geom']['coordinates']
        message_text += f"{lat:.6f}, {lon:.6f}\n"

    message_text += "\n🗺️ Voir la carte complète : https://lsnmst.github.io/idjwi-alert-system/frontend/"
else:
    message_text = (
        "🌳 Aucune nouvelle alerte de déforestation cette semaine sur l'île d'Idjwi.\n"
        "🗺️ Voir la carte complète : https://lsnmst.github.io/idjwi-alert-system/frontend/"
    )

# ---------- SEND WHATSAPP ----------
headers = {"Authorization": f"Bearer {ACCESS_TOKEN}", "Content-Type": "application/json"}

for sub in subscribers:
    payload = {
        "messaging_product": "whatsapp",
        "to": sub['phone_number'],
        "type": "text",
        "text": {"body": message_text}
    }
    response = requests.post(META_API_URL, json=payload, headers=headers)
    print(f"Sent to {sub['phone_number']} - Status: {response.status_code}")
