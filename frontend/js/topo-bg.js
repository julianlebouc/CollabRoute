/**
 * topo-bg.js — Topographic contour-line background.
 *
 * Algorithm:
 *  1. Build a heightmap using 4-octave fractal value noise (fBm).
 *  2. Trace isolines at regular elevation intervals via marching squares.
 *  3. Draw thin strokes on a fixed <canvas> behind all content.
 *  4. Redraws on window resize (debounced).
 */

(function initTopoBg() {
    'use strict';

    const canvas = document.getElementById('topo-bg');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // ── Noise ──────────────────────────────────────────────────────────────────

    /** Pseudo-random [0,1] from integer grid coordinates + seed. */
    function hash(ix, iy, s) {
        const v = Math.sin(ix * 127.1 + iy * 311.7 + s * 74.3) * 43758.5453123;
        return v - Math.floor(v);
    }

    /** Smoothstep — removes grid artifacts in bilinear interpolation. */
    function smooth(t) { return t * t * (3 - 2 * t); }

    /** Bilinear value noise sampled at (x, y) with given spatial scale. */
    function vnoise(x, y, scale, seed) {
        const gx = x / scale, gy = y / scale;
        const ix = Math.floor(gx), iy = Math.floor(gy);
        const fx = smooth(gx - ix), fy = smooth(gy - iy);
        return (
            hash(ix, iy, seed) * (1 - fx) * (1 - fy) +
            hash(ix + 1, iy, seed) * fx * (1 - fy) +
            hash(ix, iy + 1, seed) * (1 - fx) * fy +
            hash(ix + 1, iy + 1, seed) * fx * fy
        );
    }

    /**
     * Fractal Brownian Motion — 4 octaves.
     * Scales are relative to the largest screen dimension so the pattern
     * looks consistent regardless of viewport size.
     */
    function makeHeightFn(maxDim) {
        return (x, y) =>
            vnoise(x, y, maxDim * 0.55, 1) * 0.50 +
            vnoise(x, y, maxDim * 0.28, 2) * 0.25 +
            vnoise(x, y, maxDim * 0.14, 3) * 0.15 +
            vnoise(x, y, maxDim * 0.07, 4) * 0.10;
    }

    // ── Marching Squares ───────────────────────────────────────────────────────

    /**
     * Linearly interpolates a contour crossing point on a grid edge.
     */
    function edgePt(va, vb, lv, ax, ay, bx, by) {
        const t = (lv - va) / (vb - va);
        return [ax + t * (bx - ax), ay + t * (by - ay)];
    }

    /**
     * Returns an array of segment endpoint pairs for one marching-squares cell,
     * or null when no contour crosses it.
     *
     * Corner bit convention (clockwise from TL):
     *   TL = bit 3 (8), TR = bit 2 (4), BR = bit 1 (2), BL = bit 0 (1)
     */
    function cellSegments(vTL, vTR, vBR, vBL, lv, x0, y0, RES) {
        const x1 = x0 + RES, y1 = y0 + RES;
        const idx =
            (vTL > lv ? 8 : 0) |
            (vTR > lv ? 4 : 0) |
            (vBR > lv ? 2 : 0) |
            (vBL > lv ? 1 : 0);

        if (idx === 0 || idx === 15) return null;

        // Edge midpoints (lazy)
        const T = () => edgePt(vTL, vTR, lv, x0, y0, x1, y0);
        const R = () => edgePt(vTR, vBR, lv, x1, y0, x1, y1);
        const B = () => edgePt(vBL, vBR, lv, x0, y1, x1, y1);
        const L = () => edgePt(vTL, vBL, lv, x0, y0, x0, y1);

        // Saddle-case disambiguation: use cell average to pick connectivity
        const avg = (vTL + vTR + vBR + vBL) / 4;

        switch (idx) {
            case 1: return [L(), B()];
            case 2: return [B(), R()];
            case 3: return [L(), R()];
            case 4: return [T(), R()];
            case 5: return avg > lv ? [T(), R(), L(), B()] : [T(), L(), B(), R()];
            case 6: return [T(), B()];
            case 7: return [T(), L()];
            case 8: return [T(), L()];
            case 9: return [T(), B()];
            case 10: return avg > lv ? [T(), L(), B(), R()] : [T(), R(), L(), B()];
            case 11: return [T(), R()];
            case 12: return [L(), R()];
            case 13: return [B(), R()];
            case 14: return [L(), B()];
        }
        return null;
    }

    // ── Draw ───────────────────────────────────────────────────────────────────

    function draw() {
        const W = canvas.width = window.innerWidth;
        const H = canvas.height = window.innerHeight;
        ctx.clearRect(0, 0, W, H);

        const height = makeHeightFn(Math.max(W, H));

        // 4 px per grid cell — good balance of smoothness vs. speed
        const RES = 4;
        const cols = Math.ceil(W / RES) + 1;
        const rows = Math.ceil(H / RES) + 1;

        // Build heightmap
        const field = new Float32Array(cols * rows);
        let minV = Infinity, maxV = -Infinity;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const v = height(c * RES, r * RES);
                field[r * cols + c] = v;
                if (v < minV) minV = v;
                if (v > maxV) maxV = v;
            }
        }

        // Trace isolines
        const LEVELS = 28;

        for (let li = 1; li < LEVELS; li++) {
            const lv = minV + (maxV - minV) * li / LEVELS;

            // Every 7th line is a "major" contour — thicker and slightly darker
            const isMajor = li % 7 === 0;
            ctx.strokeStyle = isMajor
                ? 'rgba(0, 0, 0, 0.1)'
                : 'rgba(0, 0, 0, 0.06)';
            ctx.lineWidth = 0.35;
            ctx.lineCap = 'round';

            ctx.beginPath();

            for (let r = 0; r < rows - 1; r++) {
                for (let c = 0; c < cols - 1; c++) {
                    const vTL = field[r * cols + c];
                    const vTR = field[r * cols + c + 1];
                    const vBR = field[(r + 1) * cols + c + 1];
                    const vBL = field[(r + 1) * cols + c];

                    const segs = cellSegments(vTL, vTR, vBR, vBL, lv, c * RES, r * RES, RES);
                    if (!segs) continue;

                    for (let s = 0; s < segs.length; s += 2) {
                        ctx.moveTo(segs[s][0], segs[s][1]);
                        ctx.lineTo(segs[s + 1][0], segs[s + 1][1]);
                    }
                }
            }

            ctx.stroke();
        }
    }

    // Defer one frame so the layout is fully settled before measuring
    requestAnimationFrame(draw);

    // Redraw on resize (debounced)
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(draw, 250);
    });
})();
