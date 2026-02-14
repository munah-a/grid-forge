# Contributing to GridForge GIS

Thank you for your interest in contributing to GridForge GIS! This guide will help you get started.

## Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/your-username/grid-forge.git
   cd grid-forge
   ```
3. **Install** dependencies:
   ```bash
   npm install
   ```
4. **Start** the dev server:
   ```bash
   npm run dev
   ```
5. Open `http://localhost:5173` in your browser

## Development Workflow

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Make your changes
3. Run tests:
   ```bash
   npm run test
   ```
4. Build to verify no errors:
   ```bash
   npm run build
   ```
5. Commit with a clear message describing the change
6. Push to your fork and open a Pull Request

## Project Structure

```
src/
  App.jsx          - Main React component (UI, panels, canvas)
  engine.js        - Core algorithms (gridding, contouring, import/export)
  crs.js           - Coordinate Reference System transformations
  plotEngine.js    - Print/plot layout system
  tinEditor.js     - TIN mesh editing
  storage.js       - IndexedDB persistence
  gridding.worker.js - Web Worker for background computation
```

## Code Style

- **No external CSS** — all styles are inline React style objects
- **Minimal dependencies** — prefer vanilla JS implementations
- **Theme colors** use the `C` object defined at the top of `App.jsx`
- **Icons** are inline SVG components in the `I` object
- Components use `Btn`, `Sel`, `Sld`, `Label`, and `Section` helpers

## Reporting Bugs

- Use the in-app bug reporter (click the bug icon in the toolbar), or
- Open an issue on GitHub with:
  - Steps to reproduce
  - Expected vs actual behavior
  - Browser and OS info
  - Sample data if applicable

## Pull Request Guidelines

- Keep PRs focused on a single change
- Include a clear description of what and why
- Add tests for new algorithms or data processing logic
- Ensure the build passes (`npm run build`)
- Test with the sample dataset (`data/sample-points.txt`)

## Areas Where Help Is Welcome

- Additional gridding algorithms
- Performance optimizations for large datasets
- Accessibility improvements
- Internationalization (i18n)
- Documentation and tutorials
- Bug fixes

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
