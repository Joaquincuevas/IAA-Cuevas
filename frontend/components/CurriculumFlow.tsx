"use client";

import { useEffect, useRef } from "react";

// Semester nodes (left) and PE nodes (right) within a 720x360 canvas
const SEMS = [
  { label: "S1", y: 30  },
  { label: "S2", y: 72  },
  { label: "S3", y: 114 },
  { label: "S4", y: 156 },
  { label: "S5", y: 198 },
  { label: "S6", y: 240 },
  { label: "S7", y: 282 },
  { label: "S8", y: 324 },
];

const PES = [
  { label: "PE5",  y: 36  },
  { label: "PE6",  y: 90  },
  { label: "PE7",  y: 144 },
  { label: "PE8",  y: 198 },
  { label: "PE9",  y: 252 },
  { label: "PE10", y: 306 },
];

// Weighted connections: [sem_idx, pe_idx, level 0=Alta 1=Media 2=Baja]
const LINKS: [number, number, number][] = [
  [0,0,0],[0,1,1],[0,2,2],
  [1,0,0],[1,2,0],[1,3,1],
  [2,1,0],[2,2,0],[2,4,1],
  [3,0,1],[3,2,0],[3,3,0],[3,5,2],
  [4,1,0],[4,3,0],[4,4,0],[4,5,1],
  [5,2,0],[5,3,0],[5,4,1],[5,5,0],
  [6,3,0],[6,4,0],[6,5,0],
  [7,4,0],[7,5,0],
];

const LEVEL_COLOR = [
  "rgba(226,232,240,0.95)", // Alta — white-ish
  "rgba(96,165,250,0.90)",  // Media — blue
  "rgba(59,130,246,0.60)",  // Baja — dimmer blue
];

interface Particle {
  link: number;
  t: number;
  speed: number;
  size: number;
  color: string;
}

function bezierPoint(
  t: number,
  x0: number, y0: number,
  x1: number, y1: number,
  x2: number, y2: number,
  x3: number, y3: number
) {
  const u = 1 - t;
  return {
    x: u*u*u*x0 + 3*u*u*t*x1 + 3*u*t*t*x2 + t*t*t*x3,
    y: u*u*u*y0 + 3*u*u*t*y1 + 3*u*t*t*y2 + t*t*t*y3,
  };
}

export default function CurriculumFlow() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    if (!ctx) return;

    const W = 720, H = 360;
    const LX = 90, RX = 630;
    const NODE_R = 5;

    // Spawn initial particles
    const particles: Particle[] = [];
    for (let i = 0; i < 22; i++) {
      particles.push(spawnParticle(i / 22));
    }

    function spawnParticle(startT = 0): Particle {
      const link = Math.floor(Math.random() * LINKS.length);
      return {
        link,
        t: startT,
        speed: 0.003 + Math.random() * 0.004,
        size: 2 + Math.random() * 2,
        color: LEVEL_COLOR[LINKS[link][2]],
      };
    }

    let rafId: number;

    function frame() {
      ctx.clearRect(0, 0, W, H);

      // Draw bezier curves (static, very subtle)
      LINKS.forEach(([si, pi]) => {
        const sy = SEMS[si].y + 18;
        const py = PES[pi].y + 18;
        const cx1 = LX + (RX - LX) * 0.38;
        const cx2 = LX + (RX - LX) * 0.62;
        ctx.beginPath();
        ctx.moveTo(LX + NODE_R, sy);
        ctx.bezierCurveTo(cx1, sy, cx2, py, RX - NODE_R, py);
        ctx.strokeStyle = "rgba(255,255,255,0.045)";
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      // Draw and update particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        const [si, pi] = LINKS[p.link];
        const sy = SEMS[si].y + 18;
        const py = PES[pi].y + 18;
        const cx1 = LX + (RX - LX) * 0.38;
        const cx2 = LX + (RX - LX) * 0.62;

        const pos = bezierPoint(p.t, LX + NODE_R, sy, cx1, sy, cx2, py, RX - NODE_R, py);

        // Trail
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, p.size * 1.8, 0, Math.PI * 2);
        ctx.fillStyle = p.color.replace("0.95", "0.15").replace("0.90", "0.12").replace("0.60", "0.08");
        ctx.fill();

        // Dot
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();

        p.t += p.speed;
        if (p.t >= 1) {
          particles[i] = spawnParticle(0);
        }
      }

      // Left nodes — semester labels
      SEMS.forEach((s) => {
        const y = s.y + 18;
        ctx.beginPath();
        ctx.arc(LX, y, NODE_R, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fill();
        ctx.font = "bold 10px Inter, sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.textAlign = "right";
        ctx.fillText(s.label, LX - 10, y + 4);
      });

      // Right nodes — PE labels
      PES.forEach((p) => {
        const y = p.y + 18;
        ctx.beginPath();
        ctx.arc(RX, y, NODE_R + 1.5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(226,232,240,0.95)";
        ctx.fill();
        ctx.font = "bold 10px Inter, sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.textAlign = "left";
        ctx.fillText(p.label, RX + 12, y + 4);
      });

      rafId = requestAnimationFrame(frame);
    }

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div className="w-full flex flex-col items-center">
      {/* Column labels */}
      <div className="w-full max-w-[720px] flex justify-between px-2 mb-1">
        <span className="text-[11px] font-semibold tracking-widest text-white/30 uppercase">Semestres</span>
        <span className="text-[11px] font-semibold tracking-widest text-white/30 uppercase">Perfil de Egreso</span>
      </div>
      <canvas
        ref={canvasRef}
        width={720}
        height={360}
        className="w-full max-w-[720px]"
      />
      {/* Legend */}
      <div className="flex items-center gap-6 mt-3">
        {[["Alta", "bg-white/90"], ["Media", "bg-blue-400/90"], ["Baja", "bg-blue-600/60"]].map(([label, cls]) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${cls}`} />
            <span className="text-[11px] text-white/40">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
