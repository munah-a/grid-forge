# Security Policy

## Architecture

GridForge GIS is a **100% client-side** application. All data processing happens in your browser — no data is ever sent to any server. The only network requests are:

- **Map tiles** from OpenStreetMap and ArcGIS (optional basemap imagery)
- **CRS definitions** from epsg.io (when looking up coordinate reference systems)

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public GitHub issue for security vulnerabilities
2. Instead, open a private security advisory via GitHub's [Security Advisories](https://github.com/munah-a/grid-forge/security/advisories/new)
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will acknowledge receipt within 48 hours and aim to release a fix promptly.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.0.x   | Yes       |
| < 1.0   | No        |

## Security Measures

- **Content Security Policy** headers restrict script and resource origins
- **No eval()** or dynamic code execution
- **Prototype pollution protection** in data parsers (GeoJSON, Shapefile)
- **Input validation** on all file imports with format and size checks
- **No external dependencies** for core algorithms — minimal supply chain risk
- **Blob URL lifecycle management** prevents memory leaks
