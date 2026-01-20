/**
 * Data loading module for the Medicare Advantage Dashboard
 */

const DataLoader = {
    // Data storage
    enrollment: null,
    decemberEnrollment: null,
    changes: null,
    contracts: null,
    geoData: null,

    // Base path for data files (adjust for local vs deployed)
    basePath: '',

    /**
     * Initialize the data loader
     * @param {string} basePath - Base path for data files
     */
    init(basePath = '') {
        this.basePath = basePath;
    },

    /**
     * Load all required data files
     * @returns {Promise<Object>} Object containing all loaded data
     */
    async loadAll() {
        try {
            const [enrollment, decemberEnrollment, changes, contracts, geoData] = await Promise.all([
                this.loadEnrollment(),
                this.loadDecemberEnrollment(),
                this.loadChanges(),
                this.loadContracts(),
                this.loadGeoData()
            ]);

            return {
                enrollment,
                decemberEnrollment,
                changes,
                contracts,
                geoData,
                success: true
            };
        } catch (error) {
            console.error('Error loading data:', error);
            return {
                enrollment: null,
                decemberEnrollment: null,
                changes: null,
                contracts: null,
                geoData: null,
                success: false,
                error: error.message
            };
        }
    },

    /**
     * Load current enrollment data
     * @returns {Promise<Object>} Enrollment data
     */
    async loadEnrollment() {
        const response = await fetch(`${this.basePath}data/processed/enrollment-current.json`);
        if (!response.ok) {
            throw new Error(`Failed to load enrollment data: ${response.status}`);
        }
        this.enrollment = await response.json();
        return this.enrollment;
    },

    /**
     * Load December baseline enrollment data
     * @returns {Promise<Object>} December enrollment data
     */
    async loadDecemberEnrollment() {
        try {
            const response = await fetch(`${this.basePath}data/processed/enrollment-december.json`);
            if (!response.ok) {
                console.warn('December enrollment data not available');
                return null;
            }
            this.decemberEnrollment = await response.json();
            return this.decemberEnrollment;
        } catch (error) {
            console.warn('Could not load December enrollment data:', error);
            return null;
        }
    },

    /**
     * Load enrollment changes (vs December)
     * @returns {Promise<Object>} Changes data
     */
    async loadChanges() {
        try {
            const response = await fetch(`${this.basePath}data/processed/enrollment-changes.json`);
            if (!response.ok) {
                console.warn('Changes data not available - December baseline may not exist');
                return null;
            }
            this.changes = await response.json();
            return this.changes;
        } catch (error) {
            console.warn('Could not load changes data:', error);
            return null;
        }
    },

    /**
     * Load contracts mapping
     * @returns {Promise<Object>} Contracts data
     */
    async loadContracts() {
        try {
            const response = await fetch(`${this.basePath}data/processed/contracts.json`);
            if (!response.ok) {
                return {};
            }
            this.contracts = await response.json();
            return this.contracts;
        } catch (error) {
            console.warn('Could not load contracts data:', error);
            return {};
        }
    },

    /**
     * Load county GeoJSON/TopoJSON data
     * @returns {Promise<Object>} GeoJSON feature collection
     */
    async loadGeoData() {
        // Try loading local TopoJSON first, then fallback to CDN
        const sources = [
            `${this.basePath}data/geo/us-counties.json`,
            'https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json'
        ];

        for (const source of sources) {
            try {
                const response = await fetch(source);
                if (!response.ok) continue;

                const data = await response.json();

                // Convert TopoJSON to GeoJSON if needed
                if (data.type === 'Topology') {
                    this.geoData = topojson.feature(data, data.objects.counties);
                } else {
                    this.geoData = data;
                }

                return this.geoData;
            } catch (error) {
                console.warn(`Failed to load geo data from ${source}:`, error);
            }
        }

        throw new Error('Could not load county geographic data from any source');
    },

    /**
     * Get enrollment data for a specific county
     * @param {string} fips - County FIPS code
     * @returns {Object|null} County enrollment data
     */
    getCountyData(fips) {
        if (!this.enrollment || !this.enrollment.counties) return null;
        return this.enrollment.counties[fips] || null;
    },

    /**
     * Get change data for a specific county
     * @param {string} fips - County FIPS code
     * @returns {Object|null} County change data
     */
    getCountyChange(fips) {
        if (!this.changes || !this.changes.counties) return null;
        return this.changes.counties[fips] || null;
    },

    /**
     * Get all unique parent organizations
     * @returns {Array<string>} Sorted array of organization names
     */
    getOrganizations() {
        if (!this.enrollment || !this.enrollment.by_org) return [];
        return Object.keys(this.enrollment.by_org).sort();
    },

    /**
     * Get all unique contracts
     * @returns {Array<string>} Sorted array of contract IDs
     */
    getContracts() {
        if (!this.contracts) return [];
        return Object.keys(this.contracts).sort();
    },

    /**
     * Get all unique states
     * @returns {Array<string>} Sorted array of state codes
     */
    getStates() {
        if (!this.enrollment || !this.enrollment.by_state) return [];
        return Object.keys(this.enrollment.by_state).sort();
    },

    /**
     * Get all unique plan types
     * @returns {Array<string>} Array of plan type names
     */
    getPlanTypes() {
        if (!this.enrollment || !this.enrollment.by_plan_type) return [];
        return Object.keys(this.enrollment.by_plan_type);
    },

    /**
     * Filter counties by criteria
     * @param {Object} filters - Filter criteria
     * @returns {Object} Filtered county data
     */
    filterCounties(filters = {}) {
        if (!this.enrollment || !this.enrollment.counties) return {};

        const { organization, contract, planTypes, state, groupFilter } = filters;
        const result = {};

        for (const [fips, county] of Object.entries(this.enrollment.counties)) {
            // State filter
            if (state && county.state !== state) continue;

            // Calculate filtered enrollment
            let filteredEnrollment = 0;

            // Group filter (individual/group/all)
            if (groupFilter && groupFilter !== 'all' && county.by_group) {
                if (groupFilter === 'individual') {
                    filteredEnrollment = county.by_group.individual || 0;
                } else if (groupFilter === 'group') {
                    filteredEnrollment = county.by_group.group || 0;
                }
            } else {
                // Plan type filter
                if (planTypes && planTypes.length > 0) {
                    for (const type of planTypes) {
                        filteredEnrollment += county.by_plan_type[type] || 0;
                    }
                } else {
                    filteredEnrollment = county.total;
                }
            }

            // Organization filter (takes precedence when set)
            if (organization && county.by_org) {
                filteredEnrollment = county.by_org[organization] || 0;
            }

            // Contract filter (takes precedence when set)
            if (contract && county.contracts) {
                filteredEnrollment = county.contracts[contract] || 0;
            }

            // Only include if there's enrollment after filtering
            if (filteredEnrollment > 0) {
                result[fips] = {
                    ...county,
                    filteredEnrollment
                };
            }
        }

        return result;
    },

    /**
     * Calculate summary statistics for filtered data
     * @param {Object} filteredCounties - Filtered county data
     * @param {Object} filters - Current filter settings (optional, for dynamic change calculation)
     * @returns {Object} Summary statistics
     */
    calculateSummary(filteredCounties, filters = {}) {
        let totalEnrollment = 0;
        let totalDecember = 0;
        let countyCount = 0;

        for (const [fips, county] of Object.entries(filteredCounties)) {
            totalEnrollment += county.filteredEnrollment || county.total;
            countyCount++;

            // Calculate filtered December enrollment for this county
            const decEnrollment = this.getFilteredDecemberEnrollment(fips, filters);
            totalDecember += decEnrollment;
        }

        const totalChange = totalEnrollment - totalDecember;
        const changePercent = totalDecember > 0 ? (totalChange / totalDecember * 100) : 0;

        return {
            totalEnrollment,
            totalChange,
            changePercent,
            countyCount,
            totalDecember
        };
    },

    /**
     * Get filtered December enrollment for a county
     * @param {string} fips - County FIPS code
     * @param {Object} filters - Current filter settings
     * @returns {number} Filtered December enrollment
     */
    getFilteredDecemberEnrollment(fips, filters = {}) {
        if (!this.decemberEnrollment || !this.decemberEnrollment.counties) return 0;

        const decCounty = this.decemberEnrollment.counties[fips];
        if (!decCounty) return 0;

        const { organization, contract, planTypes, groupFilter } = filters;

        // Apply the same filtering logic as filterCounties
        let decEnrollment = 0;

        // Group filter (individual/group/all)
        if (groupFilter && groupFilter !== 'all' && decCounty.by_group) {
            if (groupFilter === 'individual') {
                decEnrollment = decCounty.by_group.individual || 0;
            } else if (groupFilter === 'group') {
                decEnrollment = decCounty.by_group.group || 0;
            }
        } else {
            // Plan type filter
            if (planTypes && planTypes.length > 0) {
                for (const type of planTypes) {
                    decEnrollment += (decCounty.by_plan_type && decCounty.by_plan_type[type]) || 0;
                }
            } else {
                decEnrollment = decCounty.total;
            }
        }

        // Organization filter (takes precedence when set)
        if (organization && decCounty.by_org) {
            decEnrollment = decCounty.by_org[organization] || 0;
        }

        // Contract filter (takes precedence when set)
        if (contract && decCounty.contracts) {
            decEnrollment = decCounty.contracts[contract] || 0;
        }

        return decEnrollment;
    },

    /**
     * Get top gainers (counties with largest enrollment increase)
     * @param {Object} filteredCounties - Filtered county data
     * @param {number} n - Number of results
     * @returns {Array} Top N gainers
     */
    getTopGainers(filteredCounties, n = 5) {
        if (!this.changes) return [];

        const counties = Object.entries(filteredCounties)
            .map(([fips, county]) => {
                const change = this.getCountyChange(fips);
                return {
                    fips,
                    name: `${county.county}, ${county.state}`,
                    change: change?.change || 0,
                    changePct: change?.change_pct || 0
                };
            })
            .filter(c => c.change > 0);

        return Utils.sortBy(counties, 'change', true).slice(0, n);
    },

    /**
     * Get top losers (counties with largest enrollment decrease)
     * @param {Object} filteredCounties - Filtered county data
     * @param {number} n - Number of results
     * @returns {Array} Top N losers
     */
    getTopLosers(filteredCounties, n = 5) {
        if (!this.changes) return [];

        const counties = Object.entries(filteredCounties)
            .map(([fips, county]) => {
                const change = this.getCountyChange(fips);
                return {
                    fips,
                    name: `${county.county}, ${county.state}`,
                    change: change?.change || 0,
                    changePct: change?.change_pct || 0
                };
            })
            .filter(c => c.change < 0);

        return Utils.sortBy(counties, 'change', false).slice(0, n);
    },

    /**
     * Get organization breakdown for filtered counties
     * @param {Object} filteredCounties - Filtered county data
     * @returns {Array} Organization enrollment breakdown
     */
    getOrgBreakdown(filteredCounties) {
        const orgTotals = {};

        for (const county of Object.values(filteredCounties)) {
            if (county.by_org) {
                for (const [org, enrollment] of Object.entries(county.by_org)) {
                    orgTotals[org] = (orgTotals[org] || 0) + enrollment;
                }
            }
        }

        return Object.entries(orgTotals)
            .map(([org, enrollment]) => ({ org, enrollment }))
            .sort((a, b) => b.enrollment - a.enrollment);
    },

    /**
     * Get metadata about the loaded data
     * @returns {Object} Metadata
     */
    getMetadata() {
        if (!this.enrollment || !this.enrollment.metadata) {
            return {
                processedDate: null,
                totalEnrollment: 0,
                recordCount: 0
            };
        }
        return this.enrollment.metadata;
    }
};

// Export for use in other modules
window.DataLoader = DataLoader;
