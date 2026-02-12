// GridForge GIS — i18n Scaffold
// String externalization for future internationalization

const LOCALE = 'en-US';

const strings = {
    'en-US': {
        // App shell
        'app.title': 'GridForge GIS',
        'app.subtitle': 'Survey Data Processing',
        'app.version': 'Version',

        // Panels
        'panel.import': 'Import',
        'panel.grid': 'Grid',
        'panel.bounds': 'Bounds',
        'panel.layers': 'Layers',
        'panel.export': 'Export',
        'panel.plot': 'Plot',
        'panel.tin': 'TIN',
        'panel.compare': 'Compare',
        'panel.settings': 'Settings',
        'panel.help': 'Help',

        // Import
        'import.dropHint': 'Drop a file here or use the Import panel',
        'import.supported': 'Supports CSV, TSV, GeoJSON, Shapefile, GPX, LAS, Excel — No point limit',
        'import.fileTooLarge': 'File too large ({size} MB). Maximum is 50 MB.',
        'import.fileLargeWarn': 'File is {size} MB. Large files may slow down the browser. Continue?',

        // CRS
        'crs.prompt': 'Set Coordinate Reference System',
        'crs.local': 'Local (Cartesian)',

        // Export
        'export.data': 'Export Data',
        'export.map': 'Export Map',
        'export.project': 'Project',
        'export.settings': 'Settings',
        'export.pointsCsv': 'Points as CSV',
        'export.pointsGeoJson': 'Points as GeoJSON',
        'export.contourGeoJson': 'Contours as GeoJSON',
        'export.contourDxf': 'Contours as DXF',
        'export.gridAscii': 'Grid as ASCII',

        // Gridding
        'grid.algorithm': 'Algorithm',
        'grid.resolution': 'Grid Resolution',
        'grid.run': 'Run Gridding',
        'grid.running': 'Gridding…',
        'grid.presets': 'Gridding Presets',

        // Layers
        'layer.noLayers': 'No layers yet. Import data to begin.',
        'layer.opacity': 'Opacity',
        'layer.symbolSize': 'Symbol Size',
        'layer.color': 'Color',
        'layer.labels': 'Labels',
        'layer.shape': 'Shape',
        'layer.filter': 'Z-Range Filter',
        'layer.proportional': 'Proportional sizing (by Z)',

        // Contours
        'contour.interval': 'Contour Interval',
        'contour.smoothing': 'Smoothing',
        'contour.lineWeight': 'Line Weight',
        'contour.labels': 'Labels',

        // Selection
        'select.lasso': 'Alt+click to place lasso vertices, double-click to select',
        'select.box': 'Shift+drag to box select',
        'select.clear': 'Press Escape to clear selection',

        // Persistence
        'persist.autoSaveRecover': 'Recovered auto-save from {ago}. Restore?',
        'persist.settingsImported': 'Settings imported!',
        'persist.settingsFailed': 'Failed to import settings.',
    }
};

/**
 * Get a localized string by key.
 * Supports simple {placeholder} substitution.
 * @param {string} key - Dot-separated string key
 * @param {Object} [params] - Placeholder values
 * @param {string} [locale] - Override locale
 * @returns {string}
 */
export function t(key, params = {}, locale = LOCALE) {
    const dict = strings[locale] || strings['en-US'];
    let s = dict[key] || key;
    for (const [k, v] of Object.entries(params)) {
        s = s.replace(`{${k}}`, String(v));
    }
    return s;
}

/**
 * Register additional locale strings.
 * @param {string} locale
 * @param {Object} dict
 */
export function registerLocale(locale, dict) {
    strings[locale] = { ...(strings[locale] || {}), ...dict };
}

export function getLocale() { return LOCALE; }
export function getSupportedLocales() { return Object.keys(strings); }

export default t;
