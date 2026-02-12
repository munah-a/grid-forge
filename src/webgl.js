// GridForge GIS – WebGL2 GPGPU Accelerated Gridding
// Uses GPU fragment shaders for embarrassingly parallel interpolation.

/**
 * Compute IDW interpolation on the GPU using WebGL2.
 * Falls back to null if WebGL2 is unavailable.
 *
 * @param {Array<{x:number,y:number,z:number}>} points
 * @param {number[]} gridX - X coordinates of each column
 * @param {number[]} gridY - Y coordinates of each row
 * @param {{ power?: number, searchRadius?: number }} opts
 * @returns {Float64Array|null} grid values (row-major, ny×nx), or null on failure
 */
export function idwWebGL(points, gridX, gridY, opts = {}) {
    const { power = 2, searchRadius = Infinity } = opts;
    const nx = gridX.length, ny = gridY.length;
    const n = points.length;
    if (n === 0 || nx === 0 || ny === 0) return null;

    // ── Create OffscreenCanvas + WebGL2 context ──────────────────────────
    let canvas, gl;
    try {
        canvas = new OffscreenCanvas(nx, ny);
        gl = canvas.getContext("webgl2", { antialias: false, depth: false, stencil: false });
    } catch (_) { /* OffscreenCanvas not available */ }
    if (!gl) return null;

    // Need float render target
    const floatExt = gl.getExtension("EXT_color_buffer_float");
    if (!floatExt) { gl.getExtension("WEBGL_color_buffer_float"); } // try v1 name
    // Also ensure float textures are filterable (optional, we use NEAREST)
    gl.getExtension("OES_texture_float_linear");

    // ── Shift coordinates to local origin for float32 precision ──────────
    const xMin = gridX[0], yMin = gridY[0];
    const xMax = gridX[nx - 1], yMax = gridY[ny - 1];

    // ── Pack point data into a texture ──────────────────────────────────
    // Use a 1D-ish texture: width = min(n, maxTexSize), height = ceil(n/width)
    const maxTexSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const texW = Math.min(n, maxTexSize);
    const texH = Math.ceil(n / texW);
    const pointData = new Float32Array(texW * texH * 4); // RGBA32F
    for (let i = 0; i < n; i++) {
        const off = i * 4;
        pointData[off] = points[i].x - xMin;     // local x
        pointData[off + 1] = points[i].y - yMin;  // local y
        pointData[off + 2] = points[i].z;          // z value
        pointData[off + 3] = 1.0;                  // flag: valid
    }
    // Pad remaining with flag=0
    for (let i = n; i < texW * texH; i++) {
        pointData[i * 4 + 3] = 0.0;
    }

    // ── Shaders ─────────────────────────────────────────────────────────
    const vsSource = `#version 300 es
    in vec2 a_pos;
    void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
  `;

    const fsSource = `#version 300 es
    precision highp float;
    uniform sampler2D u_points;
    uniform int u_numPoints;
    uniform int u_texW;
    uniform int u_texH;
    uniform float u_power;
    uniform float u_searchRadius2; // squared search radius
    uniform float u_xMin;
    uniform float u_yMin;
    uniform float u_xRange;
    uniform float u_yRange;
    uniform float u_hasSearchRadius; // 1.0 if finite, 0.0 if infinite
    out vec4 fragColor;

    void main() {
      // Map fragment coord to world coordinate (local)
      float gx = gl_FragCoord.x / float(textureSize(u_points, 0).x != 0 ? 1 : 1);
      // Actually: fragCoord goes from 0.5 to nx-0.5 for nx pixels
      float tx = gl_FragCoord.x - 0.5;
      float ty = gl_FragCoord.y - 0.5;
      float worldX = u_xMin + tx * u_xRange;
      float worldY = u_yMin + ty * u_yRange;

      // But we stored points as (x - xMin, y - yMin), so worldX here is local
      // Actually let's just use local coords:
      float localX = tx * u_xRange;
      float localY = ty * u_yRange;

      float wSum = 0.0;
      float vSum = 0.0;
      float exactZ = 0.0;
      bool hasExact = false;

      for (int i = 0; i < u_numPoints; i++) {
        int ix = i % u_texW;
        int iy = i / u_texW;
        vec4 pt = texelFetch(u_points, ivec2(ix, iy), 0);
        if (pt.a < 0.5) continue; // padding

        float dx = localX - pt.x;
        float dy = localY - pt.y;
        float d2 = dx * dx + dy * dy;

        if (d2 < 1e-10) {
          exactZ = pt.z;
          hasExact = true;
          break;
        }

        if (u_hasSearchRadius > 0.5 && d2 > u_searchRadius2) continue;

        float d = sqrt(d2);
        float w;
        if (u_power == 2.0) {
          w = 1.0 / d2; // fast path for p=2
        } else {
          w = 1.0 / pow(d, u_power);
        }
        wSum += w;
        vSum += w * pt.z;
      }

      float result;
      if (hasExact) {
        result = exactZ;
      } else if (wSum > 0.0) {
        result = vSum / wSum;
      } else {
        result = -9999.0; // NaN marker (WebGL can't write NaN reliably)
      }
      fragColor = vec4(result, 0.0, 0.0, 1.0);
    }
  `;

    // ── Compile & link ──────────────────────────────────────────────────
    function compileShader(src, type) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.error("WebGL shader error:", gl.getShaderInfoLog(s));
            gl.deleteShader(s);
            return null;
        }
        return s;
    }

    const vs = compileShader(vsSource, gl.VERTEX_SHADER);
    const fs = compileShader(fsSource, gl.FRAGMENT_SHADER);
    if (!vs || !fs) return null;

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error("WebGL link error:", gl.getProgramInfoLog(prog));
        return null;
    }
    gl.useProgram(prog);

    // ── Full-screen quad ────────────────────────────────────────────────
    const quadVerts = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // ── Upload point data texture ───────────────────────────────────────
    const ptTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, ptTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, texW, texH, 0, gl.RGBA, gl.FLOAT, pointData);

    // ── Create float render target (FBO) ────────────────────────────────
    const outTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, outTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, nx, ny, 0, gl.RED, gl.FLOAT, null);

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, outTex, 0);

    const fbStatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (fbStatus !== gl.FRAMEBUFFER_COMPLETE) {
        console.warn("WebGL FBO incomplete:", fbStatus);
        cleanup();
        return null;
    }

    // ── Set uniforms ────────────────────────────────────────────────────
    gl.uniform1i(gl.getUniformLocation(prog, "u_points"), 0); // texture unit 0
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, ptTex);

    gl.uniform1i(gl.getUniformLocation(prog, "u_numPoints"), n);
    gl.uniform1i(gl.getUniformLocation(prog, "u_texW"), texW);
    gl.uniform1i(gl.getUniformLocation(prog, "u_texH"), texH);
    gl.uniform1f(gl.getUniformLocation(prog, "u_power"), power);
    gl.uniform1f(gl.getUniformLocation(prog, "u_hasSearchRadius"), isFinite(searchRadius) ? 1.0 : 0.0);
    gl.uniform1f(gl.getUniformLocation(prog, "u_searchRadius2"), isFinite(searchRadius) ? searchRadius * searchRadius : 0.0);

    // Grid cell spacing (local coords)
    const xRange = nx > 1 ? (gridX[nx - 1] - gridX[0]) / (nx - 1) : 1;
    const yRange = ny > 1 ? (gridY[ny - 1] - gridY[0]) / (ny - 1) : 1;
    gl.uniform1f(gl.getUniformLocation(prog, "u_xMin"), 0.0); // local origin
    gl.uniform1f(gl.getUniformLocation(prog, "u_yMin"), 0.0);
    gl.uniform1f(gl.getUniformLocation(prog, "u_xRange"), xRange);
    gl.uniform1f(gl.getUniformLocation(prog, "u_yRange"), yRange);

    // ── Render ──────────────────────────────────────────────────────────
    gl.viewport(0, 0, nx, ny);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.finish(); // ensure GPU completes

    // ── Read back results ───────────────────────────────────────────────
    const pixels = new Float32Array(nx * ny);
    gl.readPixels(0, 0, nx, ny, gl.RED, gl.FLOAT, pixels);

    // Convert to Float64Array and replace NaN markers
    const grid = new Float64Array(nx * ny);
    for (let i = 0; i < nx * ny; i++) {
        grid[i] = pixels[i] <= -9998.0 ? NaN : pixels[i];
    }

    // ── Cleanup ─────────────────────────────────────────────────────────
    function cleanup() {
        gl.deleteTexture(ptTex);
        gl.deleteTexture(outTex);
        gl.deleteFramebuffer(fbo);
        gl.deleteBuffer(vbo);
        gl.deleteProgram(prog);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        const loseCtx = gl.getExtension("WEBGL_lose_context");
        if (loseCtx) loseCtx.loseContext();
    }
    cleanup();

    return grid;
}

/** Check if WebGL2 GPGPU is available in this context */
export function isWebGLAvailable() {
    try {
        const c = new OffscreenCanvas(1, 1);
        const gl = c.getContext("webgl2");
        if (!gl) return false;
        const ext = gl.getExtension("EXT_color_buffer_float");
        const loseCtx = gl.getExtension("WEBGL_lose_context");
        if (loseCtx) loseCtx.loseContext();
        return !!ext;
    } catch (_) {
        return false;
    }
}
