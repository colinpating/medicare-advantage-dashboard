/**
 * Map module for the Medicare Advantage Dashboard
 * Handles Leaflet map, choropleth rendering, and interactions
 */

const MapModule = {
    // Leaflet map instance
    map: null,

    // GeoJSON layer
    countyLayer: null,

    // Currently highlighted feature
    highlightedFeature: null,

    // Display mode: 'total', 'change', 'change_pct'
    displayMode: 'total',

    // Color scales
    colorScales: {
        total: ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#084594'],
        gain: ['#f7fcf5', '#e5f5e0', '#c7e9c0', '#a1d99b', '#74c476', '#41ab5d', '#238b45', '#005a32'],
        loss: ['#fff5f0', '#fee0d2', '#fcbba1', '#fc9272', '#fb6a4a', '#ef3b2c', '#cb181d', '#99000d']
    },

    // Current data bounds for color scaling
    dataBounds: {
        maxEnrollment: 0,
        maxChange: 0,
        minChange: 0,
        maxChangePct: 0,
        minChangePct: 0
    },

    // Click callback
    onCountyClick: null,

    /**
     * Initialize the map
     * @param {string} containerId - DOM element ID for the map
     * @param {Object} options - Map options
     */
    init(containerId, options = {}) {
        // US bounds (continental + Alaska + Hawaii + Puerto Rico)
        const usBounds = L.latLngBounds(
            L.latLng(24.396308, -125.0), // Southwest
            L.latLng(49.384358, -66.93457) // Northeast
        );

        // Initialize Leaflet map centered on continental US
        this.map = L.map(containerId, {
            center: [39.8283, -98.5795],
            zoom: 4,
            minZoom: 4,
            maxZoom: 12,
            zoomControl: true,
            maxBounds: L.latLngBounds(
                L.latLng(15, -180), // Extended bounds for Alaska/Hawaii
                L.latLng(72, -50)
            ),
            maxBoundsViscosity: 1.0,
            ...options
        });

        // Add base tile layer (light gray for choropleth visibility)
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 19,
            bounds: L.latLngBounds(
                L.latLng(15, -180),
                L.latLng(72, -50)
            )
        }).addTo(this.map);

        // Add labels layer on top
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
            subdomains: 'abcd',
            maxZoom: 19,
            pane: 'shadowPane',
            bounds: L.latLngBounds(
                L.latLng(15, -180),
                L.latLng(72, -50)
            )
        }).addTo(this.map);

        return this;
    },

    /**
     * Load and render county boundaries
     * @param {Object} geoData - GeoJSON feature collection
     * @param {Object} enrollmentData - Filtered enrollment data by county
     */
    renderCounties(geoData, enrollmentData) {
        // Remove existing layer if present
        if (this.countyLayer) {
            this.map.removeLayer(this.countyLayer);
        }

        // Calculate data bounds for color scaling
        this.calculateDataBounds(enrollmentData);

        // Create GeoJSON layer
        this.countyLayer = L.geoJSON(geoData, {
            style: (feature) => this.getFeatureStyle(feature, enrollmentData),
            onEachFeature: (feature, layer) => this.bindFeatureEvents(feature, layer, enrollmentData)
        }).addTo(this.map);

        // Update legend
        this.updateLegend();

        return this;
    },

    /**
     * Calculate data bounds for color scaling
     * @param {Object} enrollmentData - Enrollment data by county
     */
    calculateDataBounds(enrollmentData) {
        let maxEnrollment = 0;
        let maxChange = 0;
        let minChange = 0;
        let maxChangePct = 0;
        let minChangePct = 0;

        for (const [fips, county] of Object.entries(enrollmentData)) {
            const enrollment = county.filteredEnrollment || county.total;
            maxEnrollment = Math.max(maxEnrollment, enrollment);

            const change = DataLoader.getCountyChange(fips);
            if (change) {
                maxChange = Math.max(maxChange, change.change);
                minChange = Math.min(minChange, change.change);
                maxChangePct = Math.max(maxChangePct, change.change_pct);
                minChangePct = Math.min(minChangePct, change.change_pct);
            }
        }

        this.dataBounds = {
            maxEnrollment,
            maxChange,
            minChange,
            maxChangePct,
            minChangePct
        };
    },

    /**
     * Get style for a county feature
     * @param {Object} feature - GeoJSON feature
     * @param {Object} enrollmentData - Enrollment data by county
     * @returns {Object} Leaflet style object
     */
    getFeatureStyle(feature, enrollmentData) {
        const fips = feature.id || feature.properties.GEOID;
        const county = enrollmentData[fips];

        // Default style for counties without data
        if (!county) {
            return {
                fillColor: '#f0f0f0',
                weight: 0.5,
                opacity: 1,
                color: '#ccc',
                fillOpacity: 0.3
            };
        }

        const color = this.getFeatureColor(fips, county);

        return {
            fillColor: color,
            weight: 0.5,
            opacity: 1,
            color: '#666',
            fillOpacity: 0.7
        };
    },

    /**
     * Get color for a county based on display mode
     * @param {string} fips - County FIPS code
     * @param {Object} county - County enrollment data
     * @returns {string} Hex color string
     */
    getFeatureColor(fips, county) {
        const { maxEnrollment, maxChange, minChange, maxChangePct, minChangePct } = this.dataBounds;

        switch (this.displayMode) {
            case 'change': {
                const change = DataLoader.getCountyChange(fips);
                if (!change) return '#f0f0f0';
                const maxAbs = Math.max(Math.abs(maxChange), Math.abs(minChange));
                return Utils.getChangeColor(change.change, maxAbs);
            }

            case 'change_pct': {
                const change = DataLoader.getCountyChange(fips);
                if (!change) return '#f0f0f0';
                const maxAbs = Math.max(Math.abs(maxChangePct), Math.abs(minChangePct));
                return Utils.getChangeColor(change.change_pct, maxAbs);
            }

            case 'total':
            default: {
                const enrollment = county.filteredEnrollment || county.total;
                return Utils.getEnrollmentColor(enrollment, maxEnrollment);
            }
        }
    },

    /**
     * Bind mouse events to a feature
     * @param {Object} feature - GeoJSON feature
     * @param {Object} layer - Leaflet layer
     * @param {Object} enrollmentData - Enrollment data by county
     */
    bindFeatureEvents(feature, layer, enrollmentData) {
        const fips = feature.id || feature.properties.GEOID;
        const county = enrollmentData[fips];

        // Tooltip
        if (county) {
            layer.bindTooltip(() => this.createTooltipContent(fips, county), {
                sticky: true,
                className: 'county-tooltip'
            });
        }

        // Hover events
        layer.on({
            mouseover: (e) => this.highlightFeature(e),
            mouseout: (e) => this.resetHighlight(e),
            click: (e) => this.handleClick(e, fips, county)
        });
    },

    /**
     * Create tooltip content for a county
     * @param {string} fips - County FIPS code
     * @param {Object} county - County enrollment data
     * @returns {string} HTML content
     */
    createTooltipContent(fips, county) {
        const change = DataLoader.getCountyChange(fips);
        const enrollment = county.filteredEnrollment || county.total;

        let html = `
            <div class="tooltip-content">
                <h5>${county.county}, ${county.state}</h5>
                <p>Enrollment: <span class="value">${Utils.formatNumber(enrollment)}</span></p>
        `;

        if (change) {
            const changeClass = Utils.getChangeClass(change.change);
            html += `
                <p>Change: <span class="value ${changeClass}">${Utils.formatChange(change.change)}</span></p>
                <p>% Change: <span class="value ${changeClass}">${Utils.formatPercent(change.change_pct)}</span></p>
            `;
        }

        html += '</div>';
        return html;
    },

    /**
     * Highlight a feature on hover
     * @param {Object} e - Leaflet event
     */
    highlightFeature(e) {
        const layer = e.target;

        layer.setStyle({
            weight: 2,
            color: '#333',
            fillOpacity: 0.85
        });

        if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
            layer.bringToFront();
        }
    },

    /**
     * Reset feature highlight
     * @param {Object} e - Leaflet event
     */
    resetHighlight(e) {
        if (this.countyLayer) {
            this.countyLayer.resetStyle(e.target);
        }
    },

    /**
     * Handle click on a county
     * @param {Object} e - Leaflet event
     * @param {string} fips - County FIPS code
     * @param {Object} county - County enrollment data
     */
    handleClick(e, fips, county) {
        // Zoom to county
        this.map.fitBounds(e.target.getBounds(), { padding: [50, 50] });

        // Call external click handler if set
        if (this.onCountyClick && county) {
            this.onCountyClick(fips, county);
        }
    },

    /**
     * Set display mode and re-render
     * @param {string} mode - Display mode: 'total', 'change', 'change_pct'
     * @param {Object} enrollmentData - Current filtered enrollment data
     */
    setDisplayMode(mode, enrollmentData) {
        this.displayMode = mode;

        if (this.countyLayer && enrollmentData) {
            this.countyLayer.eachLayer((layer) => {
                const fips = layer.feature.id || layer.feature.properties.GEOID;
                const county = enrollmentData[fips];
                layer.setStyle(this.getFeatureStyle(layer.feature, enrollmentData));
            });
        }

        this.updateLegend();
    },

    /**
     * Update the map legend
     */
    updateLegend() {
        const legendEl = document.getElementById('legend-scale');
        if (!legendEl) return;

        let html = '';
        const { maxEnrollment, maxChange, minChange, maxChangePct, minChangePct } = this.dataBounds;

        switch (this.displayMode) {
            case 'change': {
                const maxAbs = Math.max(Math.abs(maxChange), Math.abs(minChange)) || 1000;
                const steps = [-maxAbs, -maxAbs / 2, 0, maxAbs / 2, maxAbs];

                document.querySelector('.map-legend h4').textContent = 'Change from December';

                steps.forEach((val, i) => {
                    const color = Utils.getChangeColor(val, maxAbs);
                    html += `
                        <div class="legend-item">
                            <span class="legend-color" style="background: ${color}"></span>
                            <span>${Utils.formatChange(Math.round(val))}</span>
                        </div>
                    `;
                });
                break;
            }

            case 'change_pct': {
                const maxAbs = Math.max(Math.abs(maxChangePct), Math.abs(minChangePct)) || 10;
                const steps = [-maxAbs, -maxAbs / 2, 0, maxAbs / 2, maxAbs];

                document.querySelector('.map-legend h4').textContent = '% Change from December';

                steps.forEach((val) => {
                    const color = Utils.getChangeColor(val, maxAbs);
                    html += `
                        <div class="legend-item">
                            <span class="legend-color" style="background: ${color}"></span>
                            <span>${Utils.formatPercent(val)}</span>
                        </div>
                    `;
                });
                break;
            }

            case 'total':
            default: {
                const steps = [0, 0.25, 0.5, 0.75, 1].map(r => Math.round(r * maxEnrollment));

                document.querySelector('.map-legend h4').textContent = 'Total Enrollment';

                steps.forEach((val) => {
                    const color = Utils.getEnrollmentColor(val, maxEnrollment || 1);
                    html += `
                        <div class="legend-item">
                            <span class="legend-color" style="background: ${color}"></span>
                            <span>${Utils.formatNumber(val)}</span>
                        </div>
                    `;
                });
                break;
            }
        }

        legendEl.innerHTML = html;
    },

    /**
     * Reset map view to initial state
     */
    resetView() {
        this.map.setView([39.8283, -98.5795], 4);
    },

    /**
     * Zoom to a specific state
     * @param {string} stateAbbr - State abbreviation
     */
    zoomToState(stateAbbr) {
        // State center coordinates (approximate)
        const stateCenters = {
            'AL': [32.806671, -86.791130], 'AK': [61.370716, -152.404419],
            'AZ': [33.729759, -111.431221], 'AR': [34.969704, -92.373123],
            'CA': [36.116203, -119.681564], 'CO': [39.059811, -105.311104],
            'CT': [41.597782, -72.755371], 'DE': [39.318523, -75.507141],
            'FL': [27.766279, -81.686783], 'GA': [33.040619, -83.643074],
            'HI': [21.094318, -157.498337], 'ID': [44.240459, -114.478828],
            'IL': [40.349457, -88.986137], 'IN': [39.849426, -86.258278],
            'IA': [42.011539, -93.210526], 'KS': [38.526600, -96.726486],
            'KY': [37.668140, -84.670067], 'LA': [31.169546, -91.867805],
            'ME': [44.693947, -69.381927], 'MD': [39.063946, -76.802101],
            'MA': [42.230171, -71.530106], 'MI': [43.326618, -84.536095],
            'MN': [45.694454, -93.900192], 'MS': [32.741646, -89.678696],
            'MO': [38.456085, -92.288368], 'MT': [46.921925, -110.454353],
            'NE': [41.125370, -98.268082], 'NV': [38.313515, -117.055374],
            'NH': [43.452492, -71.563896], 'NJ': [40.298904, -74.521011],
            'NM': [34.840515, -106.248482], 'NY': [42.165726, -74.948051],
            'NC': [35.630066, -79.806419], 'ND': [47.528912, -99.784012],
            'OH': [40.388783, -82.764915], 'OK': [35.565342, -96.928917],
            'OR': [44.572021, -122.070938], 'PA': [40.590752, -77.209755],
            'RI': [41.680893, -71.511780], 'SC': [33.856892, -80.945007],
            'SD': [44.299782, -99.438828], 'TN': [35.747845, -86.692345],
            'TX': [31.054487, -97.563461], 'UT': [40.150032, -111.862434],
            'VT': [44.045876, -72.710686], 'VA': [37.769337, -78.169968],
            'WA': [47.400902, -121.490494], 'WV': [38.491226, -80.954453],
            'WI': [44.268543, -89.616508], 'WY': [42.755966, -107.302490],
            'DC': [38.897438, -77.026817], 'PR': [18.220833, -66.590149]
        };

        const center = stateCenters[stateAbbr];
        if (center) {
            this.map.setView(center, 6);
        }
    },

    /**
     * Update map with new filtered data
     * @param {Object} enrollmentData - Filtered enrollment data
     */
    updateData(enrollmentData) {
        if (!this.countyLayer) return;

        this.calculateDataBounds(enrollmentData);

        this.countyLayer.eachLayer((layer) => {
            const fips = layer.feature.id || layer.feature.properties.GEOID;
            const county = enrollmentData[fips];
            layer.setStyle(this.getFeatureStyle(layer.feature, enrollmentData));

            // Update tooltip
            if (county) {
                layer.unbindTooltip();
                layer.bindTooltip(() => this.createTooltipContent(fips, county), {
                    sticky: true,
                    className: 'county-tooltip'
                });
            }
        });

        this.updateLegend();
    }
};

// Export for use in other modules
window.MapModule = MapModule;
