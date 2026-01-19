/**
 * Utility functions for the Medicare Advantage Dashboard
 */

const Utils = {
    /**
     * Format a number with commas as thousands separators
     * @param {number} num - Number to format
     * @returns {string} Formatted number string
     */
    formatNumber(num) {
        if (num === null || num === undefined) return '-';
        return num.toLocaleString('en-US');
    },

    /**
     * Format a number as a percentage
     * @param {number} num - Number to format
     * @param {number} decimals - Decimal places (default 1)
     * @returns {string} Formatted percentage string
     */
    formatPercent(num, decimals = 1) {
        if (num === null || num === undefined) return '-';
        const sign = num > 0 ? '+' : '';
        return `${sign}${num.toFixed(decimals)}%`;
    },

    /**
     * Format a change value with sign
     * @param {number} num - Number to format
     * @returns {string} Formatted change string
     */
    formatChange(num) {
        if (num === null || num === undefined) return '-';
        const sign = num > 0 ? '+' : '';
        return `${sign}${this.formatNumber(num)}`;
    },

    /**
     * Get color class based on change value
     * @param {number} change - Change value
     * @returns {string} CSS class name
     */
    getChangeClass(change) {
        if (change > 0) return 'positive';
        if (change < 0) return 'negative';
        return '';
    },

    /**
     * Interpolate between two colors based on a value
     * @param {number} value - Value between min and max
     * @param {number} min - Minimum value
     * @param {number} max - Maximum value
     * @param {Array} colors - Array of color stops
     * @returns {string} Hex color string
     */
    interpolateColor(value, min, max, colors) {
        if (value <= min) return colors[0];
        if (value >= max) return colors[colors.length - 1];

        const ratio = (value - min) / (max - min);
        const colorIndex = ratio * (colors.length - 1);
        const lowerIndex = Math.floor(colorIndex);
        const upperIndex = Math.ceil(colorIndex);
        const blend = colorIndex - lowerIndex;

        const lower = this.hexToRgb(colors[lowerIndex]);
        const upper = this.hexToRgb(colors[upperIndex]);

        const r = Math.round(lower.r + (upper.r - lower.r) * blend);
        const g = Math.round(lower.g + (upper.g - lower.g) * blend);
        const b = Math.round(lower.b + (upper.b - lower.b) * blend);

        return this.rgbToHex(r, g, b);
    },

    /**
     * Convert hex color to RGB object
     * @param {string} hex - Hex color string
     * @returns {Object} RGB object with r, g, b properties
     */
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 0, b: 0 };
    },

    /**
     * Convert RGB values to hex color string
     * @param {number} r - Red (0-255)
     * @param {number} g - Green (0-255)
     * @param {number} b - Blue (0-255)
     * @returns {string} Hex color string
     */
    rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(x => {
            const hex = x.toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }).join('');
    },

    /**
     * Get enrollment color based on value
     * @param {number} value - Enrollment value
     * @param {number} max - Maximum enrollment for scale
     * @returns {string} Hex color string
     */
    getEnrollmentColor(value, max) {
        const colors = ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#084594'];
        return this.interpolateColor(value, 0, max, colors);
    },

    /**
     * Get change color (red-yellow-green scale)
     * @param {number} change - Change value (negative to positive)
     * @param {number} maxAbs - Maximum absolute change for scale
     * @returns {string} Hex color string
     */
    getChangeColor(change, maxAbs) {
        if (change === 0) return '#f39c12'; // Yellow for no change

        if (change > 0) {
            // Green scale for gains
            const colors = ['#f7fcf5', '#e5f5e0', '#c7e9c0', '#a1d99b', '#74c476', '#41ab5d', '#238b45', '#005a32'];
            return this.interpolateColor(change, 0, maxAbs, colors);
        } else {
            // Red scale for losses
            const colors = ['#fff5f0', '#fee0d2', '#fcbba1', '#fc9272', '#fb6a4a', '#ef3b2c', '#cb181d', '#99000d'];
            return this.interpolateColor(-change, 0, maxAbs, colors);
        }
    },

    /**
     * Debounce a function
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in milliseconds
     * @returns {Function} Debounced function
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Sort array of objects by a property
     * @param {Array} arr - Array to sort
     * @param {string} prop - Property name to sort by
     * @param {boolean} desc - Sort descending (default true)
     * @returns {Array} Sorted array
     */
    sortBy(arr, prop, desc = true) {
        return [...arr].sort((a, b) => {
            const aVal = a[prop] || 0;
            const bVal = b[prop] || 0;
            return desc ? bVal - aVal : aVal - bVal;
        });
    },

    /**
     * Get top N items from sorted array
     * @param {Array} arr - Array to slice
     * @param {number} n - Number of items
     * @returns {Array} Top N items
     */
    topN(arr, n) {
        return arr.slice(0, n);
    },

    /**
     * State FIPS code to abbreviation mapping
     */
    STATE_FIPS: {
        '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA',
        '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL',
        '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN',
        '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME',
        '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS',
        '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH',
        '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND',
        '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI',
        '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT',
        '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI',
        '56': 'WY', '72': 'PR', '78': 'VI'
    },

    /**
     * State abbreviation to name mapping
     */
    STATE_NAMES: {
        'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas',
        'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
        'DC': 'District of Columbia', 'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii',
        'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
        'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine',
        'MD': 'Maryland', 'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota',
        'MS': 'Mississippi', 'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska',
        'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico',
        'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
        'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island',
        'SC': 'South Carolina', 'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas',
        'UT': 'Utah', 'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington',
        'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming', 'PR': 'Puerto Rico',
        'VI': 'Virgin Islands'
    },

    /**
     * Get state abbreviation from FIPS code
     * @param {string} fips - FIPS code (first 2 digits)
     * @returns {string} State abbreviation
     */
    getStateFromFips(fips) {
        const stateFips = fips.substring(0, 2);
        return this.STATE_FIPS[stateFips] || 'Unknown';
    }
};

// Export for use in other modules
window.Utils = Utils;
