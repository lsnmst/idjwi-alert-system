// --------------------
// Initialize Supabase client
// --------------------
const supabaseUrl = 'https://sgjcevsavckwsjplzned.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnamNldnNhdmNrd3NqcGx6bmVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAyMjMyOTgsImV4cCI6MjA3NTc5OTI5OH0.eeUvKqddDTk7G1MBzQPhoNB15NIpFIrvKk90PAOYbQQ';
const supabase = supabase.createClient(supabaseUrl, supabaseKey);

// --------------------
// Initialize Leaflet map
// --------------------
const map = L.map('map').setView([0, 30], 5); // Adjust center/zoom as needed

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// --------------------
// Fetch alerts from Supabase
// --------------------
async function loadAlerts() {
    const { data, error } = await supabase
        .from('alerts')
        .select('geom, alert_value, alert_date');

    if (error) {
        console.error(error);
        return;
    }

    data.forEach(alert => {
        // Supabase stores geom as WKT, convert to lat/lon
        const matches = alert.geom.match(/POINT\(([-\d\.]+) ([-\d\.]+)\)/);
        if (matches) {
            const lng = parseFloat(matches[1]);
            const lat = parseFloat(matches[2]);
            const marker = L.circleMarker([lat, lng], {
                radius: 5,
                color: 'red',
                fillOpacity: 0.7
            }).addTo(map);
            marker.bindPopup(`Value: ${alert.alert_value}<br>Date: ${alert.alert_date}`);
        }
    });
}

// Load the alerts
loadAlerts();
