import React from 'react';
import { QUALITY_DIMENSIONS } from '../constants/taxonomy.js';

const SIZE = 260;
const CENTER = SIZE / 2;
const MAX_R = 92;
const LEVELS = 5;

function pointFor(index, total, value) {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  const r = (value / LEVELS) * MAX_R;
  return [CENTER + r * Math.cos(angle), CENTER + r * Math.sin(angle)];
}

export default function QualityRadar({ profile }) {
  const total = QUALITY_DIMENSIONS.length;
  const scores = QUALITY_DIMENSIONS.map((d) => profile?.[d.key]?.score ?? 0);

  const polygonPoints = scores
    .map((score, i) => pointFor(i, total, score).join(','))
    .join(' ');

  const gridRings = [1, 2, 3, 4, 5];

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="quality-radar" role="img" aria-label="Quality profile radar chart">
      {gridRings.map((level) => {
        const ringPoints = QUALITY_DIMENSIONS.map((_, i) => pointFor(i, total, level).join(',')).join(' ');
        return (
          <polygon
            key={level}
            points={ringPoints}
            fill="none"
            stroke="var(--border)"
            strokeWidth="1"
          />
        );
      })}

      {QUALITY_DIMENSIONS.map((d, i) => {
        const [x, y] = pointFor(i, total, LEVELS);
        return (
          <line
            key={d.key}
            x1={CENTER}
            y1={CENTER}
            x2={x}
            y2={y}
            stroke="var(--border)"
            strokeWidth="1"
          />
        );
      })}

      <polygon
        points={polygonPoints}
        fill="var(--accent-soft)"
        stroke="var(--accent-glow)"
        strokeWidth="2"
      />

      {scores.map((score, i) => {
        const [x, y] = pointFor(i, total, score);
        return <circle key={i} cx={x} cy={y} r="3" fill="var(--gold)" />;
      })}

      {gridRings.map((level) => (
        <text
          key={`scale-${level}`}
          x={CENTER + 5}
          y={CENTER - (level / LEVELS) * MAX_R}
          textAnchor="start"
          dominantBaseline="middle"
          className="radar-scale-label"
        >
          {level}
        </text>
      ))}

      {QUALITY_DIMENSIONS.map((d, i) => {
        const [x, y] = pointFor(i, total, LEVELS + 1.05);
        return (
          <text
            key={d.key}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="radar-label"
          >
            {d.label}
          </text>
        );
      })}
    </svg>
  );
}
