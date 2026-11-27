"use client";

import { usePathname } from "next/navigation";

/**
 * Fond animé de l'appli : des pistes de circuit imprimé dans le bleu Stark, avec des impulsions
 * lumineuses qui les parcourent. Fixe, derrière tout, ne capte aucun clic. Discret (faible opacité)
 * et coupé si le système demande de réduire les animations. Jamais dans le widget des clients.
 */

// Pistes (coordonnées dans un cadre 1600 × 1000) : segments droits et coudes à 45°, comme sur une carte électronique.
const TRACES: { d: string; dur: number; delay: number }[] = [
  { d: "M-20 120 H180 L240 180 H420 L470 130 H620", dur: 9, delay: 0 },
  { d: "M-20 300 H90 L150 360 H300 L340 400 V560 L390 610 H520", dur: 11, delay: 2.5 },
  { d: "M-20 760 H140 L200 700 H360 L420 760 H600 L650 810 H780", dur: 12, delay: 5 },
  { d: "M120 1020 V900 L170 850 H330 L380 900 V1020", dur: 8, delay: 1.2 },
  { d: "M560 -20 V60 L610 110 H780 L830 60 H1000", dur: 10, delay: 3.4 },
  { d: "M1620 90 H1440 L1390 140 H1220 L1170 90 H1060", dur: 9.5, delay: 0.8 },
  { d: "M1620 260 H1520 L1460 320 V480 L1410 530 H1260 L1210 480 H1120", dur: 12.5, delay: 4.2 },
  { d: "M1620 640 H1480 L1430 690 H1290 L1240 740 V860 L1190 910 H1040", dur: 11.5, delay: 6.5 },
  { d: "M1500 1020 V940 L1450 890 H1330", dur: 7, delay: 2 },
  { d: "M700 1020 V960 L750 910 H940 L990 960 H1140 L1190 1010", dur: 10.5, delay: 7.5 },
  { d: "M880 -20 V30 L930 80 H1080 L1130 30 H1260", dur: 8.5, delay: 5.8 },
  { d: "M620 420 H760 L810 470 H980 L1030 420 H1120", dur: 13, delay: 3 },
  { d: "M520 610 V700 L570 750 H700", dur: 6.5, delay: 8.5 },
  { d: "M1120 420 V330 L1170 280 H1300", dur: 7.5, delay: 1.8 },
  // Pistes supplémentaires (plus de densité, même discrétion)
  { d: "M-20 200 H60 L110 250 H240 L280 290 V340", dur: 9, delay: 6 },
  { d: "M-20 470 H200 L250 520 H420 L460 480 H560", dur: 10, delay: 1.5 },
  { d: "M-20 620 H80 L130 670 V760 L180 810 H260", dur: 8, delay: 4.6 },
  { d: "M-20 900 H230 L280 950 H450 L500 1020", dur: 9.5, delay: 7 },
  { d: "M300 -20 V40 L350 90 H470 L520 40 V-20", dur: 7, delay: 2.2 },
  { d: "M700 180 H850 L900 230 H1040 L1090 180 H1200 L1250 130 H1360", dur: 14, delay: 0.4 },
  { d: "M660 300 V340 L710 390 H880 L930 340 H1010", dur: 9, delay: 8 },
  { d: "M720 560 H860 L910 610 H1060 L1110 560 H1180 L1230 610 V690", dur: 13.5, delay: 5.2 },
  { d: "M820 690 V760 L870 810 H990", dur: 6, delay: 3.8 },
  { d: "M1620 180 H1560 L1510 230 H1390 L1340 280", dur: 8, delay: 7.2 },
  { d: "M1620 400 H1580 L1530 450 V580 L1580 630 H1620", dur: 9, delay: 2.8 },
  { d: "M1620 800 H1530 L1480 850 H1380 L1330 800 H1290", dur: 9.5, delay: 0.6 },
  { d: "M1620 960 H1600 L1550 910 H1560", dur: 5, delay: 4 },
  { d: "M1000 1020 V980 L1050 930 H1160 L1210 880 H1320", dur: 10, delay: 9 },
];

// Pastilles de soudure aux extrémités et aux jonctions.
const PADS: [number, number][] = [
  [620, 130], [520, 610], [780, 810], [380, 1020], [1000, 60], [1060, 90], [1120, 480], [1040, 910],
  [1330, 890], [1190, 1010], [1260, 30], [620, 420], [1120, 420], [700, 750], [1300, 280], [240, 180],
  [340, 400], [420, 760], [170, 850], [610, 110], [1390, 140], [1460, 320], [1430, 690], [1240, 740],
  [750, 910], [930, 80], [810, 470],
  [280, 340], [560, 480], [260, 810], [500, 1020], [470, 90], [1360, 130], [900, 230], [1010, 340],
  [1230, 690], [990, 810], [1340, 280], [1530, 450], [1290, 800], [1320, 880], [910, 610], [250, 520],
];

export function CircuitBackground() {
  const pathname = usePathname();
  if (pathname.startsWith("/w/")) return null; // widget affiché sur le site des clients : fond neutre
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <svg className="h-full w-full" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" fill="none">
        <defs>
          <radialGradient id="circuit-fade" cx="50%" cy="50%" r="75%">
            <stop offset="0%" stopColor="#2a6cdc" stopOpacity="0.035" />
            <stop offset="100%" stopColor="#2a6cdc" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="1600" height="1000" fill="url(#circuit-fade)" />
        {/* Pistes */}
        <g stroke="#2a6cdc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.11">
          {TRACES.map((t) => (
            <path key={t.d} d={t.d} />
          ))}
        </g>
        {/* Impulsions qui parcourent les pistes */}
        <g stroke="#2a6cdc" strokeLinecap="round" strokeLinejoin="round">
          {TRACES.map((t) => (
            <g key={`p${t.d}`}>
              <path className="circuit-pulse" d={t.d} pathLength={1000} strokeWidth="6" opacity="0.08" style={{ animationDuration: `${t.dur}s`, animationDelay: `${t.delay}s` }} />
              <path className="circuit-pulse" d={t.d} pathLength={1000} strokeWidth="2" opacity="0.45" style={{ animationDuration: `${t.dur}s`, animationDelay: `${t.delay}s` }} />
            </g>
          ))}
        </g>
        {/* Pastilles */}
        <g>
          {PADS.map(([x, y], i) => (
            <circle
              key={`${x}-${y}`}
              className="circuit-pad"
              cx={x}
              cy={y}
              r="4"
              fill="#ffffff"
              stroke="#2a6cdc"
              strokeWidth="1.5"
              style={{ animationDelay: `${(i * 0.7) % 6}s` }}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
