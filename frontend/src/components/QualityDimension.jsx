import React from 'react';

const CONFIDENCE_LABEL = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Limited reviews',
  editorial: 'AI editorial assessment',
};

export default function QualityDimension({ label, data }) {
  const score = data?.score ?? 0;
  const confidence = data?.confidence || 'low';

  return (
    <div className="quality-dimension">
      <div className="quality-dimension-head">
        <span className="quality-dimension-label">{label}</span>
        <span className="quality-dimension-score">{score}/5</span>
      </div>
      <div className="quality-bar-track">
        <div className="quality-bar-fill" style={{ width: `${(score / 5) * 100}%` }} />
      </div>
      {data?.synthesis && <p className="quality-synthesis">{data.synthesis}</p>}
      {data?.representative_quote && (
        <p className="quality-quote">&ldquo;{data.representative_quote}&rdquo;</p>
      )}
      <span className={`confidence-tag confidence-${confidence}`}>
        {CONFIDENCE_LABEL[confidence] || confidence}
      </span>
    </div>
  );
}
