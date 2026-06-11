"use client";

import { useEffect, useRef } from "react";

interface NodeDef {
  bx: number;
  by: number;
  r: number;
  color: string;
  phase: number;
  speed: number;
  amp: number;
}

interface EdgeDef {
  a: number;
  b: number;
  w: number;
}

const NODES: NodeDef[] = [
  { bx: 160, by: 130, r: 9,  color: "#1B2A4A", phase: 0.0, speed: 0.45, amp: 12 },
  { bx:  60, by:  60, r: 6,  color: "#243B6E", phase: 1.0, speed: 0.60, amp: 14 },
  { bx: 260, by:  60, r: 6,  color: "#243B6E", phase: 2.1, speed: 0.55, amp: 13 },
  { bx:  60, by: 200, r: 6,  color: "#243B6E", phase: 0.4, speed: 0.70, amp: 11 },
  { bx: 260, by: 200, r: 6,  color: "#243B6E", phase: 1.6, speed: 0.62, amp: 15 },
  { bx:  18, by: 130, r: 4,  color: "#4A72B8", phase: 2.5, speed: 0.80, amp: 10 },
  { bx: 302, by: 130, r: 4,  color: "#4A72B8", phase: 3.2, speed: 0.75, amp: 10 },
  { bx: 160, by:  18, r: 4,  color: "#4A72B8", phase: 0.9, speed: 0.85, amp: 9  },
  { bx: 110, by: 170, r: 3,  color: "#7A9CC8", phase: 1.3, speed: 0.95, amp: 8  },
  { bx: 210, by:  90, r: 3,  color: "#7A9CC8", phase: 2.3, speed: 0.90, amp: 9  },
  { bx: 200, by: 170, r: 3,  color: "#7A9CC8", phase: 3.6, speed: 1.00, amp: 8  },
  { bx: 130, by:  40, r: 2.5,color: "#9AB8D8", phase: 0.6, speed: 1.10, amp: 7  },
  { bx: 240, by: 155, r: 2.5,color: "#9AB8D8", phase: 1.9, speed: 1.05, amp: 7  },
];

const EDGES: EdgeDef[] = [
  { a: 0, b: 1, w: 1.5 }, { a: 0, b: 2, w: 1.5 },
  { a: 0, b: 3, w: 1.5 }, { a: 0, b: 4, w: 1.5 },
  { a: 1, b: 5, w: 1.0 }, { a: 2, b: 6, w: 1.0 },
  { a: 3, b: 5, w: 1.0 }, { a: 4, b: 6, w: 1.0 },
  { a: 1, b: 7, w: 1.0 }, { a: 2, b: 7, w: 1.0 },
  { a: 0, b: 8, w: 0.8 }, { a: 0, b: 9, w: 0.8 },
  { a: 3, b: 8, w: 0.8 }, { a: 2, b: 9, w: 0.8 },
  { a: 1, b: 11,w: 0.7 }, { a: 7, b: 11,w: 0.7 },
  { a: 4, b: 12,w: 0.7 }, { a: 6, b: 12,w: 0.7 },
];

export default function AnimatedGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    if (!ctx) return;

    const W = 320;
    const H = 260;
    let t = 0;
    let rafId: number;

    // Current positions (updated each frame)
    const px = NODES.map(n => n.bx);
    const py = NODES.map(n => n.by);

    function frame() {
      t += 0.007;

      // Update floating positions
      NODES.forEach((n, i) => {
        px[i] = n.bx + Math.sin(t * n.speed + n.phase) * n.amp;
        py[i] = n.by + Math.cos(t * n.speed * 0.8 + n.phase + 1.2) * n.amp * 0.75;
      });

      ctx.clearRect(0, 0, W, H);

      // Draw edges with subtle opacity
      EDGES.forEach(e => {
        ctx.beginPath();
        ctx.moveTo(px[e.a], py[e.a]);
        ctx.lineTo(px[e.b], py[e.b]);
        ctx.strokeStyle = "rgba(209, 213, 219, 0.85)";
        ctx.lineWidth = e.w;
        ctx.stroke();
      });

      // Draw nodes with soft glow on the larger ones
      NODES.forEach((n, i) => {
        if (n.r >= 6) {
          // Glow ring
          const glow = ctx.createRadialGradient(px[i], py[i], n.r * 0.6, px[i], py[i], n.r * 2.2);
          glow.addColorStop(0, "rgba(27,42,74,0.18)");
          glow.addColorStop(1, "rgba(27,42,74,0)");
          ctx.beginPath();
          ctx.arc(px[i], py[i], n.r * 2.2, 0, Math.PI * 2);
          ctx.fillStyle = glow;
          ctx.fill();
        }
        // Main dot
        ctx.beginPath();
        ctx.arc(px[i], py[i], n.r, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.fill();
      });

      rafId = requestAnimationFrame(frame);
    }

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={320}
      height={260}
      className="w-full h-full opacity-70"
    />
  );
}
