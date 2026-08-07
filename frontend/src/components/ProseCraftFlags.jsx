import React from 'react';

const STYLE_LABEL = {
  accessible: 'Accessible',
  literary: 'Literary',
  lyrical: 'Lyrical',
  sparse: 'Sparse',
  purple: 'Purple / ornate',
  conversational: 'Conversational',
};

const GRAMMAR_LABEL = {
  clean: 'Grammar: clean',
  minor_issues: 'Grammar: minor issues',
  notable_issues: 'Grammar: notable issues',
};

const DIALOGUE_LABEL = {
  natural: 'Dialogue: natural',
  mixed: 'Dialogue: mixed',
  stilted: 'Dialogue: stilted',
};

const FLAG_TONE = {
  clean: 'good',
  minor_issues: 'mixed',
  notable_issues: 'concern',
  natural: 'good',
  mixed: 'mixed',
  stilted: 'concern',
};

function Badge({ tone, label, note }) {
  return (
    <span className={`craft-flag craft-flag-${tone}`} title={note || undefined}>
      {label}
    </span>
  );
}

export default function ProseCraftFlags({ quality }) {
  const style = quality?.writing_style;
  const grammar = quality?.grammar_technical;
  const dialogue = quality?.dialogue_realism;

  if (!style && !grammar && !dialogue) return null;

  return (
    <div className="craft-flags">
      {style?.style && <Badge tone="style" label={STYLE_LABEL[style.style] || style.style} note={style.note} />}
      {grammar?.flag && (
        <Badge tone={FLAG_TONE[grammar.flag] || 'mixed'} label={GRAMMAR_LABEL[grammar.flag] || grammar.flag} note={grammar.note} />
      )}
      {dialogue?.flag && (
        <Badge
          tone={FLAG_TONE[dialogue.flag] || 'mixed'}
          label={DIALOGUE_LABEL[dialogue.flag] || dialogue.flag}
          note={dialogue.note}
        />
      )}
    </div>
  );
}
