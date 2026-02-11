# GridForge GIS

Professional browser-based GIS application for gridding, contouring, and spatial visualization. Runs entirely in the browser — no server required, your data never leaves your machine.

**Live demo:** [https://munah-a.github.io/grid-forge/](https://munah-a.github.io/grid-forge/)

## Features

### Data Import
- CSV, TSV, and delimited text with auto-detection of columns (X, Y, Z, Point No, Description)
- GeoJSON point data
- Headerless files with smart column inference
- Coordinate reference system support via proj4

### Gridding Algorithms (14)
- **IDW** — Inverse Distance Weighting with configurable power and search radius
- **Natural Neighbor** — Sibson weight approximation
- **Minimum Curvature** — Biharmonic spline relaxation
- **Kriging Ordinary** — With empirical semivariogram estimation and weight validation
- **Kriging Universal** — Polynomial drift with local coordinate normalization
- **Kriging Simple** — Known-mean variant with covariance-based weights
- **RBF** — Radial Basis Functions (multiquadric, Gaussian, thin plate spline, etc.)
- **TIN** — Delaunay triangulation with linear interpolation (optimized Bowyer-Watson)
- **Nearest Neighbor** — Voronoi-style assignment
- **Moving Average** — Weighted spatial averaging
- **Polynomial Regression** — Global polynomial surface fitting (orders 1–3)
- **Modified Shepard** — Locally weighted polynomial interpolation
- **Data Metrics** — Statistical aggregation (mean, median, min, max, count)
- **Hillshade** — Analytical shading from grid elevation data

### Visualization
- Interactive pan and zoom
- Multi-layer management
- Multiple base map themes (Dark, Light, Aerial, Topographic, Blueprint)
- 20+ color ramps (Viridis, Plasma, Terrain, Ocean, Spectral, and more)
- Contour generation with isoline labeling and filled contours
- 3D perspective view

### Analysis Tools
- Distance, polyline, and polygon measurement
- Grid math operations
- Convex and concave hull generation
- Breakline support (proximity, wall, and standard densification)
- Boundary masking

### Export
- Points to CSV and GeoJSON
- Contours to GeoJSON
- Grid to Esri ASCII format
- Full project serialization (save/load)

## Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## Benchmarking

A benchmark script is included to test all gridding algorithms against real survey data:

```bash
node bench.mjs
```

## Documentation

See `docs/PRD.md` for full product requirements and technical specifications.

## Sample Data

Sample survey point data is included in `data/sample-points.txt`.

## Tech Stack

- React 18
- Vite 6
- proj4 (coordinate transformations)
- Web Workers for background gridding
- 100% client-side — no backend required

## License

MIT
