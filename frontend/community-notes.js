// community-notes.js
window.addEventListener('load', () => {
    if (!window.map || !window.supabaseClient) {
        console.error("Map or Supabase client not found!");
        return;
    }

    const map = window.map;
    const supabaseClient = window.supabaseClient;

    const addBtn = document.getElementById('add-note-floating');
    const modal = document.getElementById('note-modal');
    const form = document.getElementById('note-form');
    const cancelBtn = document.getElementById('note-cancel');

    let addingMode = false;
    let tempMarker = null;
    let noteLatLng = null;

    const notesLayer = L.layerGroup().addTo(map);

    const openModal = () => modal.style.display = 'flex';
    const closeModal = () => {
        modal.style.display = 'none';
        if (tempMarker) { map.removeLayer(tempMarker); tempMarker = null; }
        addingMode = false;
        addBtn.style.background = '#fff';
        addBtn.textContent = '+ Ajouter une note';
    };

    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    addBtn.addEventListener('click', () => {
        addingMode = !addingMode;
        addBtn.style.background = addingMode ? 'red' : '#fff';
        addBtn.textContent = addingMode ? 'Cliquez sur la carte...' : '+ Ajouter une note';

        map.getContainer().style.cursor = addingMode ? 'crosshair' : '';
    });

    map.on('click', (e) => {
        if (!addingMode) return;
        noteLatLng = e.latlng;
        if (tempMarker) map.removeLayer(tempMarker);
        // 🟪 Replace pin with a small square
        const halfSideDeg = 0.000135; // ~30 m, same as your alert tiles
        const color = '#ff6600'; // color for new note placement (you can change)

        const bounds = [
            [noteLatLng.lat - halfSideDeg, noteLatLng.lng - halfSideDeg],
            [noteLatLng.lat + halfSideDeg, noteLatLng.lng + halfSideDeg]
        ];

        tempMarker = L.rectangle(bounds, {
            color,
            weight: 2,
            fillColor: color,
            fillOpacity: 0.6,
            interactive: true
        }).addTo(map);

        // Allow repositioning: click again somewhere else
        map.once('click', (ev) => {
            map.removeLayer(tempMarker);
            noteLatLng = ev.latlng;
            const newBounds = [
                [noteLatLng.lat - halfSideDeg, noteLatLng.lng - halfSideDeg],
                [noteLatLng.lat + halfSideDeg, noteLatLng.lng + halfSideDeg]
            ];
            tempMarker = L.rectangle(bounds, {
                color: '#FFD700',
                weight: 2,
                fillColor: '#FFD700',
                fillOpacity: 0.6
            }).addTo(map);
        });
        openModal();
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!noteLatLng) { alert('Cliquez sur la carte pour placer la note.'); return; }

        const title = document.getElementById('note-title').value.trim();
        const description = document.getElementById('note-description').value.trim();
        const category = document.getElementById('note-category').value;

        const payload = {
            geom: { type: 'Point', coordinates: [noteLatLng.lng, noteLatLng.lat] },
            title,
            description,
            category,
            created_by: supabaseClient.auth.getUser()?.user?.id || null,
            created_by_name: supabaseClient.auth.getUser()?.user?.email || 'anonymous'
        };

        const { error } = await supabaseClient.from('community_notes').insert(payload);
        if (error) {
            console.error('Erreur:', error);
            alert('Erreur lors de la sauvegarde.');
            return;
        }
        alert('Note enregistrée ! Elle sera visible après validation.');
        closeModal();
        fetchAndRenderNotes();
    });

    async function fetchAndRenderNotes({ onlyValidated = true } = {}) {
        const { data, error } = await supabaseClient
            .from('community_notes')
            .select('id, geom, title, description, category, validated, created_at, created_by_name');

        if (error) { console.error(error); return; }

        notesLayer.clearLayers();

        const iconMap = {
            'mine': '⛏️',
            'charcoal': '🔥',
            'agriculture': '🌾',
            'settlement': '🏠',
            'other': '📝'
        };

        const zoomThreshold = 12;

        data
            .filter(n => n.geom && n.geom.coordinates && (!onlyValidated || n.validated))
            .forEach(n => {
                const [lon, lat] = n.geom.coordinates;

                if (map.getZoom() <= zoomThreshold) return;

                // Use category icon or default
                const icon = iconMap[n.category] || '📝';

                const popupHtml = `
<b>${icon} <br><br>NOTES DE LA COMMUNAUTÉ<br> <h2>${n.title}</h2></b><br>
${n.description || ''}<br>
<small>${new Date(n.created_at).toLocaleDateString('fr-FR')}</small>
${n.validated ? '' : '<br><i style="color:#a00;">En attente de validation</i>'}
        `;

                const svgIcon = L.divIcon({
                    className: '', // remove default marker styles
                    html: `
<svg width="24px" height="24px" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect width="24" height="24" fill="white" fill-opacity="0.01"/>
<path d="M8 6C8 4.89543 8.89543 4 10 4H30L40 14V42C40 43.1046 39.1046 44 38 44H10C8.89543 44 8 43.1046 8 42V6Z" fill="#FFD700" stroke="#000000" stroke-width="1" stroke-linejoin="round"/>
<path d="M16 20H32" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M16 28H32" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>            `,
                    iconSize: [24, 24],
                    iconAnchor: [12, 12] // center on the location
                });

                L.marker([lat, lon], { icon: svgIcon })
                    .bindPopup(popupHtml)
                    .addTo(notesLayer);
            });

    }

    fetchAndRenderNotes();
    map.on('moveend', fetchAndRenderNotes);
});
