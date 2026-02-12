// GridForge GIS – TIN Editor Module
// Mutable half-edge mesh with editing operations, hit-testing, and undo/redo.
// Converts to/from the engine.js delaunayTriangulate() output format.

// ═══════════════════════════════════════════════════════════════════════════════
// MESH DATA STRUCTURE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build an editable mesh from delaunayTriangulate() output.
 * @param {{ v0: Int32Array, v1: Int32Array, v2: Int32Array, count: number,
 *           px: Float64Array, py: Float64Array, pz: Float64Array }} tin
 * @param {number} nPoints - Number of real points (excludes super-triangle verts)
 * @returns {Object} Mutable mesh
 */
export function buildMesh(tin, nPoints) {
    const n = nPoints || tin.pz.length;
    const vertices = [];
    for (let i = 0; i < n; i++) {
        vertices.push({ x: tin.px[i], y: tin.py[i], z: tin.pz[i], id: i });
    }

    const triangles = [];
    for (let i = 0; i < tin.count; i++) {
        triangles.push({
            v0: tin.v0[i], v1: tin.v1[i], v2: tin.v2[i],
            alive: true, locked: false,
        });
    }

    const mesh = {
        vertices,
        triangles,
        // Adjacency: edge key → [triIndex, ...]
        edgeToTri: new Map(),
        // Vertex → [triIndex, ...] (triangles using this vertex)
        vertToTri: [],
        // Constrained edges (cannot be swapped)
        constrainedEdges: new Set(),
        // Undo/redo
        undoStack: [],
        redoStack: [],
    };

    // Build adjacency
    rebuildAdjacency(mesh);
    return mesh;
}

/**
 * Rebuild all adjacency indices from current triangles.
 */
export function rebuildAdjacency(mesh) {
    mesh.edgeToTri = new Map();
    mesh.vertToTri = mesh.vertices.map(() => []);

    for (let ti = 0; ti < mesh.triangles.length; ti++) {
        const t = mesh.triangles[ti];
        if (!t.alive) continue;
        const verts = [t.v0, t.v1, t.v2];

        // Edge adjacency
        for (let e = 0; e < 3; e++) {
            const a = verts[e], b = verts[(e + 1) % 3];
            const key = edgeKey(a, b);
            let arr = mesh.edgeToTri.get(key);
            if (!arr) { arr = []; mesh.edgeToTri.set(key, arr); }
            arr.push(ti);
        }

        // Vertex adjacency
        for (const vi of verts) {
            if (vi < mesh.vertToTri.length) {
                mesh.vertToTri[vi].push(ti);
            }
        }
    }
}

/**
 * Convert mesh back to engine-compatible typed arrays.
 * @returns {{ v0, v1, v2, count, px, py, pz }}
 */
export function exportMesh(mesh) {
    const alive = mesh.triangles.filter(t => t.alive);
    const count = alive.length;
    const v0 = new Int32Array(count);
    const v1 = new Int32Array(count);
    const v2 = new Int32Array(count);
    for (let i = 0; i < count; i++) {
        v0[i] = alive[i].v0; v1[i] = alive[i].v1; v2[i] = alive[i].v2;
    }
    const n = mesh.vertices.length;
    const px = new Float64Array(n + 3);
    const py = new Float64Array(n + 3);
    const pz = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        px[i] = mesh.vertices[i].x;
        py[i] = mesh.vertices[i].y;
        pz[i] = mesh.vertices[i].z;
    }
    return { v0, v1, v2, count, px, py, pz };
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/** Cantor-style edge key (order-independent) */
export function edgeKey(a, b) {
    return a < b ? a * 131071 + b : b * 131071 + a;
}

/** Point-in-triangle test (barycentric) */
function pointInTriangle(px, py, ax, ay, bx, by, cx, cy) {
    const d = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(d) < 1e-12) return false;
    const u = ((px - ax) * (cy - ay) - (py - ay) * (cx - ax)) / d;
    const v = ((py - ay) * (bx - ax) - (px - ax) * (by - ay)) / d;
    return u >= -1e-8 && v >= -1e-8 && (u + v) <= 1 + 1e-8;
}

/** Distance from point (px,py) to line segment (ax,ay)→(bx,by) */
function distToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-12) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Compute circumcircle of triangle (for Delaunay checks) */
function circumcircle(ax, ay, bx, by, cx, cy) {
    const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(D) < 1e-12) return { cx: 0, cy: 0, r2: 1e30 };
    const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
    const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / D;
    const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / D;
    return { cx: ux, cy: uy, r2: (ax - ux) ** 2 + (ay - uy) ** 2 };
}

/** Check if point d is inside circumcircle of triangle abc */
function inCircumcircle(ax, ay, bx, by, cx, cy, dx, dy) {
    const cc = circumcircle(ax, ay, bx, by, cx, cy);
    return (dx - cc.cx) ** 2 + (dy - cc.cy) ** 2 < cc.r2 - 1e-8;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HIT TESTING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Find triangle containing point (x,y).
 * @returns {number} Triangle index, or -1
 */
export function findTriangleAt(mesh, x, y) {
    for (let ti = 0; ti < mesh.triangles.length; ti++) {
        const t = mesh.triangles[ti];
        if (!t.alive) continue;
        const a = mesh.vertices[t.v0], b = mesh.vertices[t.v1], c = mesh.vertices[t.v2];
        if (pointInTriangle(x, y, a.x, a.y, b.x, b.y, c.x, c.y)) return ti;
    }
    return -1;
}

/**
 * Find nearest edge to point (x,y) within tolerance.
 * @returns {{ triIndex: number, edgeVerts: [number,number], dist: number } | null}
 */
export function findEdgeAt(mesh, x, y, tolerance) {
    let best = null;
    const visited = new Set();
    for (let ti = 0; ti < mesh.triangles.length; ti++) {
        const t = mesh.triangles[ti];
        if (!t.alive) continue;
        const verts = [t.v0, t.v1, t.v2];
        for (let e = 0; e < 3; e++) {
            const a = verts[e], b = verts[(e + 1) % 3];
            const key = edgeKey(a, b);
            if (visited.has(key)) continue;
            visited.add(key);
            const va = mesh.vertices[a], vb = mesh.vertices[b];
            const d = distToSegment(x, y, va.x, va.y, vb.x, vb.y);
            if (d <= tolerance && (!best || d < best.dist)) {
                best = { triIndex: ti, edgeVerts: [a, b], dist: d };
            }
        }
    }
    return best;
}

/**
 * Find nearest vertex to point (x,y) within tolerance.
 * @returns {{ vertIndex: number, dist: number } | null}
 */
export function findVertexAt(mesh, x, y, tolerance) {
    let best = null;
    for (let i = 0; i < mesh.vertices.length; i++) {
        const v = mesh.vertices[i];
        const d = Math.hypot(x - v.x, y - v.y);
        if (d <= tolerance && (!best || d < best.dist)) {
            best = { vertIndex: i, dist: d };
        }
    }
    return best;
}

// ═══════════════════════════════════════════════════════════════════════════════
// UNDO / REDO
// ═══════════════════════════════════════════════════════════════════════════════

function pushUndo(mesh, op) {
    mesh.undoStack.push(op);
    mesh.redoStack = []; // Clear redo on new action
}

/**
 * Snapshot the mesh state for undo. Returns a compact snapshot.
 */
function snapshotMesh(mesh) {
    return {
        vertices: mesh.vertices.map(v => ({ ...v })),
        triangles: mesh.triangles.map(t => ({ ...t })),
        constrainedEdges: new Set(mesh.constrainedEdges),
    };
}

function restoreSnapshot(mesh, snap) {
    mesh.vertices = snap.vertices.map(v => ({ ...v }));
    mesh.triangles = snap.triangles.map(t => ({ ...t }));
    mesh.constrainedEdges = new Set(snap.constrainedEdges);
    rebuildAdjacency(mesh);
}

/**
 * Undo last operation. Returns true if successful.
 */
export function undoEdit(mesh) {
    if (mesh.undoStack.length === 0) return false;
    const op = mesh.undoStack.pop();
    mesh.redoStack.push(snapshotMesh(mesh));
    restoreSnapshot(mesh, op);
    return true;
}

/**
 * Redo last undone operation. Returns true if successful.
 */
export function redoEdit(mesh) {
    if (mesh.redoStack.length === 0) return false;
    const op = mesh.redoStack.pop();
    mesh.undoStack.push(snapshotMesh(mesh));
    restoreSnapshot(mesh, op);
    return true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EDITING OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Swap (flip) the shared edge between two adjacent triangles.
 * @param {Object} mesh
 * @param {number} va - First vertex of the edge
 * @param {number} vb - Second vertex of the edge
 * @returns {boolean} Success
 */
export function swapEdge(mesh, va, vb) {
    const key = edgeKey(va, vb);
    if (mesh.constrainedEdges.has(key)) return false;

    const tris = mesh.edgeToTri.get(key);
    if (!tris || tris.length !== 2) return false;

    const ti1 = tris[0], ti2 = tris[1];
    const t1 = mesh.triangles[ti1], t2 = mesh.triangles[ti2];
    if (!t1.alive || !t2.alive) return false;
    if (t1.locked || t2.locked) return false;

    // Find the opposite vertices
    const opp1 = oppositeVertex(t1, va, vb);
    const opp2 = oppositeVertex(t2, va, vb);
    if (opp1 === -1 || opp2 === -1) return false;

    // Check convexity: the quad must be convex for the flip to be valid
    const v = mesh.vertices;
    if (!isConvexQuad(v[va], v[opp1], v[vb], v[opp2])) return false;

    // Save undo
    pushUndo(mesh, snapshotMesh(mesh));

    // Perform the flip: replace edge (va,vb) with edge (opp1,opp2)
    t1.v0 = opp1; t1.v1 = opp2; t1.v2 = va;
    t2.v0 = opp1; t2.v1 = opp2; t2.v2 = vb;

    rebuildAdjacency(mesh);
    return true;
}

/**
 * Insert a new point into the mesh, splitting the containing triangle.
 * @param {Object} mesh
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {number} New vertex index, or -1 on failure
 */
export function insertPoint(mesh, x, y, z) {
    const ti = findTriangleAt(mesh, x, y);
    if (ti === -1) return -1;

    const t = mesh.triangles[ti];
    if (t.locked) return -1;

    pushUndo(mesh, snapshotMesh(mesh));

    // Add new vertex
    const vi = mesh.vertices.length;
    mesh.vertices.push({ x, y, z, id: vi });

    // Split triangle into 3
    const { v0, v1, v2 } = t;
    t.alive = false;

    mesh.triangles.push(
        { v0: v0, v1: v1, v2: vi, alive: true, locked: false },
        { v0: v1, v1: v2, v2: vi, alive: true, locked: false },
        { v0: v2, v1: v0, v2: vi, alive: true, locked: false },
    );

    rebuildAdjacency(mesh);

    // Restore Delaunay property via edge flips
    delaunayRestore(mesh, vi);

    return vi;
}

/**
 * Delete a point from the mesh, re-triangulating the hole.
 * @param {Object} mesh
 * @param {number} vi - Vertex index to remove
 * @returns {boolean} Success
 */
export function deletePoint(mesh, vi) {
    if (vi < 0 || vi >= mesh.vertices.length) return false;

    // Get all triangles using this vertex
    const ring = mesh.vertToTri[vi];
    if (!ring || ring.length === 0) return false;

    // Check if any triangle is locked
    for (const ti of ring) {
        if (mesh.triangles[ti].locked) return false;
    }

    pushUndo(mesh, snapshotMesh(mesh));

    // Collect boundary polygon of the hole (ordered ring of vertices)
    const boundary = [];
    const ringTris = ring.filter(ti => mesh.triangles[ti].alive);

    for (const ti of ringTris) {
        const t = mesh.triangles[ti];
        const verts = [t.v0, t.v1, t.v2];
        for (const v of verts) {
            if (v !== vi && !boundary.includes(v)) {
                boundary.push(v);
            }
        }
        t.alive = false;
    }

    // Order boundary vertices by angle around the removed point
    const cv = mesh.vertices[vi];
    boundary.sort((a, b) => {
        const va = mesh.vertices[a], vb = mesh.vertices[b];
        return Math.atan2(va.y - cv.y, va.x - cv.x) - Math.atan2(vb.y - cv.y, vb.x - cv.x);
    });

    // Fan-triangulate the hole
    if (boundary.length >= 3) {
        for (let i = 1; i < boundary.length - 1; i++) {
            mesh.triangles.push({
                v0: boundary[0], v1: boundary[i], v2: boundary[i + 1],
                alive: true, locked: false,
            });
        }
    }

    rebuildAdjacency(mesh);
    return true;
}

/**
 * Delete (mark as void) a triangle.
 * @returns {boolean} Success
 */
export function deleteTriangle(mesh, ti) {
    if (ti < 0 || ti >= mesh.triangles.length) return false;
    const t = mesh.triangles[ti];
    if (!t.alive) return false;
    if (t.locked) return false;

    pushUndo(mesh, snapshotMesh(mesh));
    t.alive = false;
    rebuildAdjacency(mesh);
    return true;
}

/**
 * Flatten a triangle: set all 3 vertices to their average Z.
 * @returns {boolean} Success
 */
export function flattenTriangle(mesh, ti) {
    if (ti < 0 || ti >= mesh.triangles.length) return false;
    const t = mesh.triangles[ti];
    if (!t.alive) return false;

    const v0 = mesh.vertices[t.v0], v1 = mesh.vertices[t.v1], v2 = mesh.vertices[t.v2];
    const avgZ = (v0.z + v1.z + v2.z) / 3;

    pushUndo(mesh, snapshotMesh(mesh));
    v0.z = avgZ;
    v1.z = avgZ;
    v2.z = avgZ;
    return true;
}

/**
 * Modify Z value of a vertex.
 * @returns {boolean} Success
 */
export function modifyVertexZ(mesh, vi, newZ) {
    if (vi < 0 || vi >= mesh.vertices.length) return false;
    pushUndo(mesh, snapshotMesh(mesh));
    mesh.vertices[vi].z = newZ;
    return true;
}

/**
 * Lock/unlock a triangle to prevent modification.
 */
export function lockTriangle(mesh, ti, locked = true) {
    if (ti < 0 || ti >= mesh.triangles.length) return false;
    const t = mesh.triangles[ti];
    if (!t.alive) return false;
    pushUndo(mesh, snapshotMesh(mesh));
    t.locked = locked;
    return true;
}

/**
 * Add a breakline (constrained edge) between two existing vertices.
 * Forces the edge into the triangulation by flipping intersecting edges.
 * @param {Object} mesh
 * @param {number} va - First vertex index
 * @param {number} vb - Second vertex index
 * @returns {boolean} Success
 */
export function addBreakline(mesh, va, vb) {
    if (va === vb || va < 0 || vb < 0) return false;
    if (va >= mesh.vertices.length || vb >= mesh.vertices.length) return false;

    const key = edgeKey(va, vb);

    // Already exists as an edge
    if (mesh.edgeToTri.has(key)) {
        mesh.constrainedEdges.add(key);
        return true;
    }

    pushUndo(mesh, snapshotMesh(mesh));

    // Iteratively flip crossing edges until the constraint edge exists
    const pA = mesh.vertices[va], pB = mesh.vertices[vb];
    let maxIter = mesh.triangles.length * 3;

    while (maxIter-- > 0) {
        // Check if edge now exists
        if (mesh.edgeToTri.has(key)) {
            mesh.constrainedEdges.add(key);
            rebuildAdjacency(mesh);
            return true;
        }

        // Find a crossing edge and flip it
        let flipped = false;
        for (const [eKey, tris] of mesh.edgeToTri) {
            if (tris.length !== 2) continue;
            if (mesh.constrainedEdges.has(eKey)) continue;

            // Decode edge
            const ea = Math.floor(eKey / 131071);
            const eb = eKey - ea * 131071;
            if (ea === va || ea === vb || eb === va || eb === vb) continue;

            // Check if this edge crosses the constraint segment
            const eaV = mesh.vertices[ea], ebV = mesh.vertices[eb];
            if (segmentsCross(pA.x, pA.y, pB.x, pB.y, eaV.x, eaV.y, ebV.x, ebV.y)) {
                // Flip this edge
                const ti1 = tris[0], ti2 = tris[1];
                const t1 = mesh.triangles[ti1], t2 = mesh.triangles[ti2];
                if (!t1.alive || !t2.alive || t1.locked || t2.locked) continue;

                const opp1 = oppositeVertex(t1, ea, eb);
                const opp2 = oppositeVertex(t2, ea, eb);
                if (opp1 === -1 || opp2 === -1) continue;

                if (!isConvexQuad(mesh.vertices[ea], mesh.vertices[opp1], mesh.vertices[eb], mesh.vertices[opp2])) continue;

                t1.v0 = opp1; t1.v1 = opp2; t1.v2 = ea;
                t2.v0 = opp1; t2.v1 = opp2; t2.v2 = eb;
                rebuildAdjacency(mesh);
                flipped = true;
                break;
            }
        }
        if (!flipped) break;
    }

    mesh.constrainedEdges.add(key);
    rebuildAdjacency(mesh);
    return true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/** Get the vertex of triangle t that is NOT va or vb */
function oppositeVertex(t, va, vb) {
    if (t.v0 !== va && t.v0 !== vb) return t.v0;
    if (t.v1 !== va && t.v1 !== vb) return t.v1;
    if (t.v2 !== va && t.v2 !== vb) return t.v2;
    return -1;
}

/** Check if 4 points form a convex quadrilateral */
function isConvexQuad(a, b, c, d) {
    const cross = (o, p, q) => (p.x - o.x) * (q.y - o.y) - (p.y - o.x) * (q.x - o.x);
    // Actually test proper convexity using cross products
    const pts = [a, b, c, d];
    let pos = 0, neg = 0;
    for (let i = 0; i < 4; i++) {
        const o = pts[i], p = pts[(i + 1) % 4], q = pts[(i + 2) % 4];
        const cp = (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
        if (cp > 0) pos++;
        else if (cp < 0) neg++;
    }
    return pos === 0 || neg === 0;
}

/** Test if two line segments cross (proper intersection, not touching) */
function segmentsCross(ax, ay, bx, by, cx, cy, dx, dy) {
    const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
    const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
    const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
    return false;
}

/**
 * Restore Delaunay property around a newly inserted vertex by flipping
 * non-Delaunay edges. Uses a stack-based approach.
 */
function delaunayRestore(mesh, newVi) {
    const stack = [];
    const vt = mesh.vertToTri[newVi];
    if (!vt) return;

    // Collect initial edges to check (edges opposite to newVi in its triangles)
    for (const ti of vt) {
        const t = mesh.triangles[ti];
        if (!t.alive) continue;
        const verts = [t.v0, t.v1, t.v2];
        for (let e = 0; e < 3; e++) {
            const a = verts[e], b = verts[(e + 1) % 3];
            if (a !== newVi && b !== newVi) {
                stack.push([a, b]);
            }
        }
    }

    let maxIter = stack.length * 4;
    while (stack.length > 0 && maxIter-- > 0) {
        const [ea, eb] = stack.pop();
        const key = edgeKey(ea, eb);
        if (mesh.constrainedEdges.has(key)) continue;

        const tris = mesh.edgeToTri.get(key);
        if (!tris || tris.length !== 2) continue;

        const ti1 = tris[0], ti2 = tris[1];
        const t1 = mesh.triangles[ti1], t2 = mesh.triangles[ti2];
        if (!t1.alive || !t2.alive || t1.locked || t2.locked) continue;

        const opp1 = oppositeVertex(t1, ea, eb);
        const opp2 = oppositeVertex(t2, ea, eb);
        if (opp1 === -1 || opp2 === -1) continue;

        // In-circumcircle test
        const va = mesh.vertices[ea], vb = mesh.vertices[eb];
        const vo1 = mesh.vertices[opp1], vo2 = mesh.vertices[opp2];

        if (inCircumcircle(va.x, va.y, vb.x, vb.y, vo1.x, vo1.y, vo2.x, vo2.y)) {
            // Check convexity
            if (!isConvexQuad(va, vo1, vb, vo2)) continue;

            // Flip
            t1.v0 = opp1; t1.v1 = opp2; t1.v2 = ea;
            t2.v0 = opp1; t2.v1 = opp2; t2.v2 = eb;
            rebuildAdjacency(mesh);

            // Add new edges to check
            stack.push([opp1, ea], [opp1, eb], [opp2, ea], [opp2, eb]);
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MESH STATISTICS
// ═══════════════════════════════════════════════════════════════════════════════

export function meshStats(mesh) {
    let alive = 0, locked = 0, constrained = mesh.constrainedEdges.size;
    for (const t of mesh.triangles) {
        if (t.alive) alive++;
        if (t.alive && t.locked) locked++;
    }
    return {
        vertices: mesh.vertices.length,
        triangles: alive,
        lockedTriangles: locked,
        constrainedEdges: constrained,
        canUndo: mesh.undoStack.length > 0,
        canRedo: mesh.redoStack.length > 0,
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENDERING HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get all edges distinct edges for wireframe rendering.
 * @returns {Array<[number,number]>} Array of [vertA, vertB] pairs
 */
export function getEdges(mesh) {
    const edges = [];
    const seen = new Set();
    for (const t of mesh.triangles) {
        if (!t.alive) continue;
        const verts = [t.v0, t.v1, t.v2];
        for (let e = 0; e < 3; e++) {
            const a = verts[e], b = verts[(e + 1) % 3];
            const key = edgeKey(a, b);
            if (!seen.has(key)) {
                seen.add(key);
                edges.push([a, b]);
            }
        }
    }
    return edges;
}

/**
 * Get alive triangles with vertex coordinates for filled rendering.
 * @returns {Array<{i:number, v0:{x,y,z}, v1:{x,y,z}, v2:{x,y,z}, locked:boolean}>}
 */
export function getTrianglesForRender(mesh) {
    const result = [];
    for (let i = 0; i < mesh.triangles.length; i++) {
        const t = mesh.triangles[i];
        if (!t.alive) continue;
        result.push({
            i,
            v0: mesh.vertices[t.v0],
            v1: mesh.vertices[t.v1],
            v2: mesh.vertices[t.v2],
            locked: t.locked,
        });
    }
    return result;
}

/**
 * Check if an edge is constrained (breakline).
 */
export function isConstrainedEdge(mesh, va, vb) {
    return mesh.constrainedEdges.has(edgeKey(va, vb));
}

/**
 * Get the swap-edge preview: returns the two new triangles that would result
 * from flipping edge (va, vb), or null if the flip is invalid.
 */
export function getSwapPreview(mesh, va, vb) {
    const key = edgeKey(va, vb);
    if (mesh.constrainedEdges.has(key)) return null;

    const tris = mesh.edgeToTri.get(key);
    if (!tris || tris.length !== 2) return null;

    const t1 = mesh.triangles[tris[0]], t2 = mesh.triangles[tris[1]];
    if (!t1.alive || !t2.alive || t1.locked || t2.locked) return null;

    const opp1 = oppositeVertex(t1, va, vb);
    const opp2 = oppositeVertex(t2, va, vb);
    if (opp1 === -1 || opp2 === -1) return null;

    const v = mesh.vertices;
    if (!isConvexQuad(v[va], v[opp1], v[vb], v[opp2])) return null;

    return {
        removedEdge: [va, vb],
        newEdge: [opp1, opp2],
        tri1: [opp1, opp2, va],
        tri2: [opp1, opp2, vb],
    };
}
