"use client";

import { useEffect, useRef } from "react";

interface NodeDef {
  bx: number; by: number; r: number;
  color: string; phase: number; speed: number; amp: number;
}

// 28 nodes spread across 520×520 — black, dark-blue, and blue-grey palette
const NODES: NodeDef[] = [
  // Centre hub
  { bx: 260, by: 260, r: 11, color: "#000000", phase: 0.0, speed: 0.40, amp: 14 },

  // Inner ring ~r100
  { bx: 260, by: 160, r: 7,  color: "#111827", phase: 1.0, speed: 0.65, amp: 16 },
  { bx: 347, by: 210, r: 7,  color: "#1B2A4A", phase: 2.1, speed: 0.58, amp: 15 },
  { bx: 347, by: 310, r: 7,  color: "#111827", phase: 3.2, speed: 0.70, amp: 17 },
  { bx: 260, by: 360, r: 7,  color: "#1B2A4A", phase: 0.5, speed: 0.62, amp: 15 },
  { bx: 173, by: 310, r: 7,  color: "#111827", phase: 1.8, speed: 0.68, amp: 16 },
  { bx: 173, by: 210, r: 7,  color: "#1B2A4A", phase: 2.8, speed: 0.60, amp: 14 },

  // Middle ring ~r180
  { bx: 260, by:  80, r: 5,  color: "#243B6E", phase: 0.3, speed: 0.80, amp: 18 },
  { bx: 395, by: 130, r: 5,  color: "#000000", phase: 1.5, speed: 0.85, amp: 19 },
  { bx: 440, by: 260, r: 5,  color: "#243B6E", phase: 2.4, speed: 0.78, amp: 17 },
  { bx: 395, by: 390, r: 5,  color: "#000000", phase: 3.3, speed: 0.88, amp: 20 },
  { bx: 260, by: 440, r: 5,  color: "#243B6E", phase: 0.8, speed: 0.82, amp: 18 },
  { bx: 125, by: 390, r: 5,  color: "#111827", phase: 1.9, speed: 0.76, amp: 19 },
  { bx:  80, by: 260, r: 5,  color: "#243B6E", phase: 2.9, speed: 0.84, amp: 17 },
  { bx: 125, by: 130, r: 5,  color: "#111827", phase: 3.8, speed: 0.79, amp: 18 },

  // Outer scatter
  { bx:  40, by:  60, r: 3.5,color: "#4A72B8", phase: 0.6, speed: 1.00, amp: 12 },
  { bx: 160, by:  30, r: 3.5,color: "#4A72B8", phase: 1.4, speed: 1.05, amp: 11 },
  { bx: 370, by:  20, r: 3.5,color: "#000000", phase: 2.2, speed: 0.95, amp: 13 },
  { bx: 490, by:  90, r: 3.5,color: "#4A72B8", phase: 3.0, speed: 1.10, amp: 12 },
  { bx: 500, by: 390, r: 3.5,color: "#000000", phase: 0.2, speed: 1.02, amp: 14 },
  { bx: 380, by: 490, r: 3.5,color: "#4A72B8", phase: 1.7, speed: 0.97, amp: 12 },
  { bx: 140, by: 490, r: 3.5,color: "#000000", phase: 2.6, speed: 1.08, amp: 13 },
  { bx:  30, by: 400, r: 3.5,color: "#4A72B8", phase: 3.5, speed: 1.00, amp: 11 },
  { bx:  20, by: 170, r: 3.5,color: "#243B6E", phase: 0.9, speed: 1.06, amp: 12 },

  // Mid-field fill nodes
  { bx: 310, by: 170, r: 2.5,color: "#7A9CC8", phase: 1.1, speed: 1.20, amp:  9 },
  { bx: 420, by: 310, r: 2.5,color: "#7A9CC8", phase: 2.0, speed: 1.15, amp:  8 },
  { bx: 190, by: 370, r: 2.5,color: "#7A9CC8", phase: 3.1, speed: 1.25, amp:  9 },
  { bx: 110, by: 180, r: 2.5,color: "#7A9CC8", phase: 0.4, speed: 1.18, amp:  8 },
];

// Edges: inner spokes + ring connections + outer web
const EDGES = [
  // Hub → inner ring
  [0,1,1.6],[0,2,1.6],[0,3,1.6],[0,4,1.6],[0,5,1.6],[0,6,1.6],
  // Inner ring loop
  [1,2,1.1],[2,3,1.1],[3,4,1.1],[4,5,1.1],[5,6,1.1],[6,1,1.1],
  // Inner → middle
  [1,7,0.9],[1,8,0.9],[2,8,0.9],[2,9,0.9],[3,9,0.9],[3,10,0.9],
  [4,10,0.9],[4,11,0.9],[5,11,0.9],[5,12,0.9],[6,12,0.9],[6,13,0.9],[1,14,0.9],
  // Middle ring loop
  [7,8,0.8],[8,9,0.8],[9,10,0.8],[10,11,0.8],[11,12,0.8],[12,13,0.8],[13,14,0.8],[14,7,0.8],
  // Middle → outer scatter
  [7,16,0.6],[8,17,0.6],[9,18,0.6],[10,19,0.6],[11,20,0.6],[12,21,0.6],[13,22,0.6],[14,23,0.6],[7,15,0.6],
  // Outer scatter connections
  [15,16,0.5],[17,18,0.5],[18,19,0.5],[20,21,0.5],[22,23,0.5],
  // Fill nodes to nearby
  [24,1,0.6],[24,2,0.6],[25,9,0.6],[25,10,0.6],[26,4,0.6],[26,5,0.6],[27,6,0.6],[27,13,0.6],
] as [number, number, number][];

export default function AnimatedGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    if (!ctx) return;

    const W = 520, H = 520;
    let t = 0, rafId: number;

    const px = NODES.map(n => n.bx);
    const py = NODES.map(n => n.by);

    function frame() {
      t += 0.022;

      NODES.forEach((n, i) => {
        px[i] = n.bx + Math.sin(t * n.speed + n.phase) * n.amp;
        py[i] = n.by + Math.cos(t * n.speed * 0.75 + n.phase + 1.3) * n.amp * 0.8;
      });

      ctx.clearRect(0, 0, W, H);

      // Edges
      EDGES.forEach(([a, b, w]) => {
        ctx.beginPath();
        ctx.moveTo(px[a], py[a]);
        ctx.lineTo(px[b], py[b]);
        ctx.strokeStyle = "rgba(200,210,225,0.75)";
        ctx.lineWidth = w;
        ctx.stroke();
      });

      // Nodes
      NODES.forEach((n, i) => {
        // Glow for nodes r≥5
        if (n.r >= 5) {
          const g = ctx.createRadialGradient(px[i], py[i], n.r * 0.4, px[i], py[i], n.r * 2.6);
          const alpha = n.color === "#000000" ? "0.12" : "0.14";
          g.addColorStop(0, `rgba(17,24,39,${alpha})`);
          g.addColorStop(1, "rgba(17,24,39,0)");
          ctx.beginPath();
          ctx.arc(px[i], py[i], n.r * 2.6, 0, Math.PI * 2);
          ctx.fillStyle = g;
          ctx.fill();
        }
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
      width={520}
      height={520}
      className="w-full h-full opacity-75"
    />
  );
}
