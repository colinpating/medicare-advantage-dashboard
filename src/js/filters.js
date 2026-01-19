/**
 * Filters module for the Medicare Advantage Dashboard
 * Handles filter UI, state management, and filter application
 */

const FiltersModule = {
    // Current filter state
    state: {
        organization: '',
        contract: '',
        planTypes: ['HMO', 'PPO', 'DSNP', 'Other'],
        state: '',
        displayMode: 'total'
    },

    // Change callback
    onChange: null,

    /**
     * Initialize filters module
     * @param {Function} onChange - Callback when filters change
     */
    init(onChange) {
        this.onChange = onChange;
        this.bindEvents();
    },

    /**
     * Populate filter options from data
     */
    populateOptions() {
        // Populate organizations
        const orgSelect = document.getElementById('org-filter');
        const orgs = DataLoader.getOrganizations();

        orgSelect.innerHTML = '<option value="">All Organizations</option>';
        orgs.forEach(org => {
            const option = document.createElement('option');
            option.value = org;
            option.textContent = org;
            orgSelect.appendChild(option);
        });

        // Populate contracts
        const contractSelect = document.getElementById('contract-filter');
        const contracts = DataLoader.getContracts();

        contractSelect.innerHTML = '<option value="">All Contracts</option>';
        contracts.forEach(contract => {
            const option = document.createElement('option');
            option.value = contract;
            option.textContent = contract;
            contractSelect.appendChild(option);
        });

        // Populate states
        const stateSelect = document.getElementById('state-filter');
        const states = DataLoader.getStates();

        stateSelect.innerHTML = '<option value="">All States</option>';
        states.forEach(state => {
            const option = document.createElement('option');
            option.value = state;
            option.textContent = `${state} - ${Utils.STATE_NAMES[state] || state}`;
            stateSelect.appendChild(option);
        });
    },

    /**
     * Bind event listeners to filter controls
     */
    bindEvents() {
        // Organization filter
        document.getElementById('org-filter').addEventListener('change', (e) => {
            this.state.organization = e.target.value;
            this.triggerChange();
        });

        // Contract filter
        document.getElementById('contract-filter').addEventListener('change', (e) => {
            this.state.contract = e.target.value;
            this.triggerChange();
        });

        // State filter
        document.getElementById('state-filter').addEventListener('change', (e) => {
            this.state.state = e.target.value;
            this.triggerChange();

            // Zoom to state on map
            if (e.target.value) {
                MapModule.zoomToState(e.target.value);
            } else {
                MapModule.resetView();
            }
        });

        // Plan type checkboxes
        document.getElementById('plan-type-filter').addEventListener('change', (e) => {
            if (e.target.type === 'checkbox') {
                this.updatePlanTypes();
                this.triggerChange();
            }
        });

        // Display mode radio buttons
        document.getElementById('display-mode').addEventListener('change', (e) => {
            if (e.target.type === 'radio') {
                this.state.displayMode = e.target.value;
                this.triggerChange();
            }
        });

        // Reset button
        document.getElementById('reset-filters').addEventListener('click', () => {
            this.reset();
        });
    },

    /**
     * Update plan types from checkboxes
     */
    updatePlanTypes() {
        const checkboxes = document.querySelectorAll('#plan-type-filter input[type="checkbox"]');
        this.state.planTypes = Array.from(checkboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value);
    },

    /**
     * Trigger change callback
     */
    triggerChange: Utils.debounce(function() {
        if (this.onChange) {
            this.onChange(this.getFilters());
        }
    }.bind(this), 100),

    /**
     * Get current filter state
     * @returns {Object} Current filters
     */
    getFilters() {
        return { ...this.state };
    },

    /**
     * Reset all filters to default
     */
    reset() {
        // Reset state
        this.state = {
            organization: '',
            contract: '',
            planTypes: ['HMO', 'PPO', 'DSNP', 'Other'],
            state: '',
            displayMode: 'total'
        };

        // Reset UI
        document.getElementById('org-filter').value = '';
        document.getElementById('contract-filter').value = '';
        document.getElementById('state-filter').value = '';

        // Reset checkboxes
        const checkboxes = document.querySelectorAll('#plan-type-filter input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = true);

        // Reset radio buttons
        document.querySelector('#display-mode input[value="total"]').checked = true;

        // Reset map view
        MapModule.resetView();

        // Trigger change
        if (this.onChange) {
            this.onChange(this.getFilters());
        }
    },

    /**
     * Set filter values programmatically
     * @param {Object} filters - Filter values to set
     */
    setFilters(filters) {
        if (filters.organization !== undefined) {
            this.state.organization = filters.organization;
            document.getElementById('org-filter').value = filters.organization;
        }

        if (filters.contract !== undefined) {
            this.state.contract = filters.contract;
            document.getElementById('contract-filter').value = filters.contract;
        }

        if (filters.state !== undefined) {
            this.state.state = filters.state;
            document.getElementById('state-filter').value = filters.state;
        }

        if (filters.planTypes !== undefined) {
            this.state.planTypes = filters.planTypes;
            const checkboxes = document.querySelectorAll('#plan-type-filter input[type="checkbox"]');
            checkboxes.forEach(cb => {
                cb.checked = filters.planTypes.includes(cb.value);
            });
        }

        if (filters.displayMode !== undefined) {
            this.state.displayMode = filters.displayMode;
            const radio = document.querySelector(`#display-mode input[value="${filters.displayMode}"]`);
            if (radio) radio.checked = true;
        }

        // Trigger change
        if (this.onChange) {
            this.onChange(this.getFilters());
        }
    },

    /**
     * Enable or disable change tracking
     * @param {boolean} disabled - Whether changes are disabled
     */
    setChangeDisabled(disabled) {
        const controls = document.querySelectorAll('.filters-panel select, .filters-panel input');
        controls.forEach(control => {
            control.disabled = disabled;
        });
    }
};

// Export for use in other modules
window.FiltersModule = FiltersModule;
