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

    map.off('movestart', map.closePopup);

    const openModal = () => modal.style.display = 'flex';
    const closeModal = () => {
        modal.style.display = 'none';
        if (tempMarker) { map.removeLayer(tempMarker); tempMarker = null; }
        addingMode = false;
        addBtn.style.background = '#FFD700';
        addBtn.style.color = 'black';
        addBtn.textContent = '+ Ajouter une note';

        map.getContainer().style.cursor = '';
    };

    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    addBtn.addEventListener('click', () => {
        addingMode = !addingMode;
        addBtn.style.background = addingMode ? 'red' : '#fff';
        addBtn.style.color = addingMode ? 'white' : 'black';
        addBtn.textContent = addingMode ? 'Cliquez sur la carte à l\'endroit où la note sera afficher...' : '+ Ajouter une note';

        map.getContainer().style.cursor = addingMode ? 'crosshair' : '';
    });

    map.on('click', (e) => {
        if (!addingMode) return;

        noteLatLng = e.latlng;

        if (tempMarker) map.removeLayer(tempMarker);

        const tempIcon = L.divIcon({
            className: '',
            html: `<div style="
            width: 24px;
            height: 24px;
            background: #FFD700;
            border: 2px solid #000;
            box-sizing: border-box;
            cursor: grab;
        "></div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
        });

        tempMarker = L.marker(noteLatLng, { icon: tempIcon, draggable: true }).addTo(map);

        // Add tooltip to guide the user
        tempMarker.bindTooltip("Déplacez-moi pour ajuster la position", { permanent: true, offset: [0, -20] }).openTooltip();

        // Update noteLatLng while dragging
        tempMarker.on('drag', (event) => {
            noteLatLng = event.target.getLatLng();
        });

        tempMarker.on('dragstart', () => {
            tempMarker.getElement().style.background = '#ff6600';
        });
        tempMarker.on('dragend', () => {
            tempMarker.getElement().style.background = '#FFD700';
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

                const marker = L.marker([lat, lon], { icon: svgIcon }).addTo(notesLayer);

                const popup = L.popup({
                    autoClose: false,
                    closeOnClick: false
                }).setContent(popupHtml);

                marker.bindPopup(popup);

                marker.on('click', () => {
                    marker.openPopup();
                });

                // Optional: Keep popup open on move/zoom
                map.on('movestart zoomstart', () => {
                    if (marker.isPopupOpen()) marker._keepPopupOpen = true;
                });
                map.on('moveend zoomend', () => {
                    if (marker._keepPopupOpen) {
                        marker.openPopup();
                        marker._keepPopupOpen = false;
                    }
                });
            });

    }

    fetchAndRenderNotes();
    map.on('moveend', fetchAndRenderNotes);
});
