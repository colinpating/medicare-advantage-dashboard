/**
 * Main application controller for the Medicare Advantage Dashboard
 */

const App = {
    // Application state
    initialized: false,
    currentData: null,

    /**
     * Initialize the application
     */
    async init() {
        console.log('Initializing Medicare Advantage Dashboard...');

        // Show loading state
        this.showLoading(true);

        try {
            // Initialize data loader with base path
            // Adjust path based on deployment context
            const basePath = this.detectBasePath();
            DataLoader.init(basePath);

            // Load all data
            const result = await DataLoader.loadAll();

            if (!result.success) {
                throw new Error(result.error || 'Failed to load data');
            }

            // Initialize map
            MapModule.init('map');
            MapModule.onCountyClick = this.handleCountyClick.bind(this);

            // Initialize filters
            FiltersModule.init(this.handleFilterChange.bind(this));
            FiltersModule.populateOptions();

            // Initial render
            const filters = FiltersModule.getFilters();
            this.updateView(filters);

            // Update header metadata
            this.updateMetadata();

            this.initialized = true;
            console.log('Dashboard initialized successfully');

        } catch (error) {
            console.error('Failed to initialize dashboard:', error);
            this.showError(error.message);
        } finally {
            this.showLoading(false);
        }
    },

    /**
     * Detect base path for data files
     * @returns {string} Base path
     */
    detectBasePath() {
        // Check if running locally or deployed
        const path = window.location.pathname;

        // If running from file:// or localhost, use relative path
        if (window.location.protocol === 'file:' ||
            window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1') {
            // Go up from src/index.html to project root
            return '../';
        }

        // For deployed version, data is at root
        return '/';
    },

    /**
     * Handle filter changes
     * @param {Object} filters - New filter state
     */
    handleFilterChange(filters) {
        this.updateView(filters);
    },

    /**
     * Update the entire view with filtered data
     * @param {Object} filters - Current filters
     */
    updateView(filters) {
        // Filter county data
        const filteredCounties = DataLoader.filterCounties({
            organization: filters.organization,
            contract: filters.contract,
            planTypes: filters.planTypes,
            state: filters.state
        });

        this.currentData = filteredCounties;

        // Update map
        if (DataLoader.geoData) {
            if (!MapModule.countyLayer) {
                MapModule.renderCounties(DataLoader.geoData, filteredCounties);
            } else {
                MapModule.updateData(filteredCounties);
            }
            MapModule.setDisplayMode(filters.displayMode, filteredCounties);
        }

        // Update info panel
        this.updateInfoPanel(filteredCounties);
    },

    /**
     * Update the info panel with current data
     * @param {Object} filteredCounties - Filtered county data
     */
    updateInfoPanel(filteredCounties) {
        // Summary statistics
        const summary = DataLoader.calculateSummary(filteredCounties);

        document.getElementById('stat-total-enrollment').textContent =
            Utils.formatNumber(summary.totalEnrollment);

        const netChangeEl = document.getElementById('stat-net-change');
        netChangeEl.textContent = Utils.formatChange(summary.totalChange);
        netChangeEl.className = `stat-value ${Utils.getChangeClass(summary.totalChange)}`;

        document.getElementById('stat-county-count').textContent =
            Utils.formatNumber(summary.countyCount);

        const pctChangeEl = document.getElementById('stat-pct-change');
        pctChangeEl.textContent = Utils.formatPercent(summary.changePercent);
        pctChangeEl.className = `stat-value ${Utils.getChangeClass(summary.changePercent)}`;

        // Top gainers
        const topGainers = DataLoader.getTopGainers(filteredCounties, 5);
        this.renderRankingList('top-gainers', topGainers, true);

        // Top losers
        const topLosers = DataLoader.getTopLosers(filteredCounties, 5);
        this.renderRankingList('top-losers', topLosers, false);

        // Organization breakdown
        const orgBreakdown = DataLoader.getOrgBreakdown(filteredCounties);
        this.renderOrgBreakdown(orgBreakdown, summary.totalEnrollment);
    },

    /**
     * Render a ranking list (gainers/losers)
     * @param {string} elementId - DOM element ID
     * @param {Array} items - Ranking items
     * @param {boolean} isGainers - Whether this is gainers list
     */
    renderRankingList(elementId, items, isGainers) {
        const listEl = document.getElementById(elementId);

        if (!items || items.length === 0) {
            listEl.innerHTML = '<li class="ranking-placeholder">No data available</li>';
            return;
        }

        listEl.innerHTML = items.map(item => {
            const valueClass = isGainers ? 'positive' : 'negative';
            return `
                <li>
                    <span class="ranking-name" title="${item.name}">${item.name}</span>
                    <span class="ranking-value ${valueClass}">${Utils.formatChange(item.change)}</span>
                </li>
            `;
        }).join('');
    },

    /**
     * Render organization breakdown
     * @param {Array} breakdown - Organization enrollment breakdown
     * @param {number} total - Total enrollment for percentage
     */
    renderOrgBreakdown(breakdown, total) {
        const containerEl = document.getElementById('org-breakdown');

        if (!breakdown || breakdown.length === 0) {
            containerEl.innerHTML = '<div class="breakdown-placeholder">No data available</div>';
            return;
        }

        // Show top 10 organizations
        const topOrgs = breakdown.slice(0, 10);
        const maxEnrollment = topOrgs[0]?.enrollment || 1;

        containerEl.innerHTML = topOrgs.map(item => {
            const pct = total > 0 ? ((item.enrollment / total) * 100).toFixed(1) : 0;
            const barWidth = (item.enrollment / maxEnrollment) * 100;

            return `
                <div class="org-item">
                    <span class="org-name" title="${item.org}">${item.org}</span>
                    <span class="org-value">${Utils.formatNumber(item.enrollment)} (${pct}%)</span>
                </div>
                <div class="org-bar" style="width: ${barWidth}%"></div>
            `;
        }).join('');
    },

    /**
     * Handle county click on map
     * @param {string} fips - County FIPS code
     * @param {Object} county - County data
     */
    handleCountyClick(fips, county) {
        const selectionEl = document.getElementById('selection-info');
        const change = DataLoader.getCountyChange(fips);

        let html = `
            <h3>Selected Area</h3>
            <div class="county-details">
                <h4>${county.county}, ${county.state}</h4>
                <div class="county-stats">
                    <div class="county-stat">
                        <span class="county-stat-label">Enrollment:</span>
                        <span class="county-stat-value">${Utils.formatNumber(county.filteredEnrollment || county.total)}</span>
                    </div>
        `;

        if (change) {
            html += `
                    <div class="county-stat">
                        <span class="county-stat-label">Change:</span>
                        <span class="county-stat-value ${Utils.getChangeClass(change.change)}">${Utils.formatChange(change.change)}</span>
                    </div>
                    <div class="county-stat">
                        <span class="county-stat-label">% Change:</span>
                        <span class="county-stat-value ${Utils.getChangeClass(change.change_pct)}">${Utils.formatPercent(change.change_pct)}</span>
                    </div>
                    <div class="county-stat">
                        <span class="county-stat-label">December:</span>
                        <span class="county-stat-value">${Utils.formatNumber(change.december)}</span>
                    </div>
            `;
        }

        html += `
                </div>
        `;

        // Add breakdown by plan type if available
        if (county.by_plan_type && Object.keys(county.by_plan_type).length > 0) {
            html += `
                <div style="margin-top: 12px;">
                    <strong>By Plan Type:</strong>
                    <ul style="list-style: none; padding-left: 0; margin: 4px 0 0 0; font-size: 0.85rem;">
            `;

            for (const [type, enrollment] of Object.entries(county.by_plan_type)) {
                html += `<li>${type}: ${Utils.formatNumber(enrollment)}</li>`;
            }

            html += '</ul></div>';
        }

        // Add breakdown by organization if available
        if (county.by_org && Object.keys(county.by_org).length > 0) {
            html += `
                <div style="margin-top: 12px;">
                    <strong>By Organization:</strong>
                    <ul style="list-style: none; padding-left: 0; margin: 4px 0 0 0; font-size: 0.85rem;">
            `;

            const sortedOrgs = Object.entries(county.by_org)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);

            for (const [org, enrollment] of sortedOrgs) {
                html += `<li>${org}: ${Utils.formatNumber(enrollment)}</li>`;
            }

            if (Object.keys(county.by_org).length > 5) {
                html += `<li><em>+ ${Object.keys(county.by_org).length - 5} more</em></li>`;
            }

            html += '</ul></div>';
        }

        html += '</div>';

        selectionEl.innerHTML = html;
    },

    /**
     * Update header metadata
     */
    updateMetadata() {
        const metadata = DataLoader.getMetadata();

        // Update data date
        const dateEl = document.getElementById('data-date');
        if (metadata.processedDate) {
            const date = new Date(metadata.processedDate);
            dateEl.textContent = `Data as of ${date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            })}`;
        } else {
            dateEl.textContent = 'Data date unknown';
        }

        // Update total enrollment
        const totalEl = document.getElementById('total-enrollment');
        totalEl.textContent = `${Utils.formatNumber(metadata.totalEnrollment || 0)} total enrollees`;
    },

    /**
     * Show/hide loading state
     * @param {boolean} show - Whether to show loading
     */
    showLoading(show) {
        const mapEl = document.getElementById('map');

        if (show) {
            mapEl.innerHTML = '<div class="loading">Loading data</div>';
        }
    },

    /**
     * Show error message
     * @param {string} message - Error message
     */
    showError(message) {
        const mapEl = document.getElementById('map');
        mapEl.innerHTML = `
            <div class="loading" style="flex-direction: column; color: #c0392b;">
                <strong>Error Loading Data</strong>
                <p style="margin-top: 8px; font-size: 0.9rem;">${message}</p>
                <p style="margin-top: 8px; font-size: 0.85rem;">
                    Make sure data files exist in <code>data/processed/</code>
                </p>
            </div>
        `;

        // Clear info panel placeholders
        document.getElementById('top-gainers').innerHTML =
            '<li class="ranking-placeholder">Data unavailable</li>';
        document.getElementById('top-losers').innerHTML =
            '<li class="ranking-placeholder">Data unavailable</li>';
        document.getElementById('org-breakdown').innerHTML =
            '<div class="breakdown-placeholder">Data unavailable</div>';
    }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

// Export for use in other modules
window.App = App;
