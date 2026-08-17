import { type ReactNode, useState } from 'react';
import type { TeamScoutData } from '../data/ftcScout';
import type { TeamFactField, TeamSeason } from '../data/schema';
import {
  fieldAgreement,
  formatSeenAt,
  googleFaviconUrl,
  sourceVoteTitle,
  type FieldAgreement,
  type FieldAgreementExtras,
  type SourceVote,
} from '../lib/sourceFieldAgreement';

function SourceFavicon({
  vote,
  onPreview,
}: {
  vote: SourceVote;
  onPreview: (vote: SourceVote | null) => void;
}) {
  const src = vote.faviconOrigin ? googleFaviconUrl(vote.faviconOrigin) : null;
  const title = sourceVoteTitle(vote);
  const className = vote.agreesWithMajority
    ? 'source-favicon source-favicon-agree'
    : 'source-favicon source-favicon-dissent';

  const inner = src ? (
    <img src={src} alt="" width={16} height={16} />
  ) : (
    <span className="source-favicon-fallback" aria-hidden="true">
      {vote.label.slice(0, 1)}
    </span>
  );

  const hoverProps = {
    onMouseEnter: () => onPreview(vote),
    onMouseLeave: () => onPreview(null),
    onFocus: () => onPreview(vote),
    onBlur: () => onPreview(null),
  };

  if (vote.sourceUrl || vote.homepage) {
    return (
      <a
        className={className}
        href={vote.sourceUrl ?? vote.homepage ?? undefined}
        target="_blank"
        rel="noreferrer"
        title={title}
        {...hoverProps}
      >
        {inner}
        <span className="visually-hidden">{title}</span>
      </a>
    );
  }

  return (
    <span className={className} title={title} tabIndex={0} {...hoverProps}>
      {inner}
      <span className="visually-hidden">{title}</span>
    </span>
  );
}

export function SourceAgreementChips({
  agreement,
  onPreview,
}: {
  agreement: FieldAgreement;
  onPreview: (vote: SourceVote | null) => void;
}) {
  if (agreement.totalVotes === 0) {
    return null;
  }

  return (
    <div className="source-agreement" aria-label={`${agreement.field} source agreement`}>
      <div className="source-agreement-row source-agreement-agree">
        {agreement.agreeing.map((vote) => (
          <SourceFavicon key={`agree-${vote.sourceId}`} vote={vote} onPreview={onPreview} />
        ))}
      </div>
      <div className="source-agreement-row source-agreement-dissent">
        {agreement.dissenting.map((vote) => (
          <SourceFavicon key={`dissent-${vote.sourceId}`} vote={vote} onPreview={onPreview} />
        ))}
      </div>
    </div>
  );
}

function renderFactValue(field: TeamFactField, value: string): ReactNode {
  if (field === 'website' && /^https?:\/\//i.test(value)) {
    return (
      <a href={value} target="_blank" rel="noreferrer">
        {value.replace(/^https?:\/\//, '')}
      </a>
    );
  }
  return value;
}

export function IdentityFactCell({
  label,
  season,
  field,
  displayedValue,
  emptyLabel = 'Not listed',
  scout,
  teamNumber,
  extra,
  compact = false,
  hideValueWhenIdle = false,
}: {
  label: string;
  season: TeamSeason;
  field: TeamFactField;
  displayedValue?: string | null;
  emptyLabel?: string;
  scout?: TeamScoutData | null;
  teamNumber?: number;
  extra?: ReactNode;
  compact?: boolean;
  hideValueWhenIdle?: boolean;
}) {
  const [hovered, setHovered] = useState<SourceVote | null>(null);
  const extras: FieldAgreementExtras = { scout, teamNumber };
  const agreement = fieldAgreement(season, field, displayedValue, extras);
  const value = hovered
    ? hovered.displayValue
    : agreement?.majorityDisplay || displayedValue || emptyLabel;
  const caption = hovered
    ? `${hovered.label} · last seen ${formatSeenAt(hovered.retrievedAt)}`
    : null;
  const showValue = !hideValueWhenIdle || hovered != null;

  return (
    <div className={compact ? 'identity-cell identity-cell-compact' : 'identity-cell'}>
      <span>{label}</span>
      {showValue ? <strong>{renderFactValue(field, value)}</strong> : null}
      {caption ? <small className="identity-source-preview">{caption}</small> : extra}
      {agreement ? <SourceAgreementChips agreement={agreement} onPreview={setHovered} /> : null}
    </div>
  );
}
