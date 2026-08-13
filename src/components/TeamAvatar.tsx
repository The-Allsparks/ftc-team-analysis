import { useEffect, useState } from 'react';

type TeamAvatarProps = {
  teamNumber: number;
  name: string;
  imageUrl: string | null;
  size?: 'sm' | 'md';
  className?: string;
};

function initialsFromName(name: string, teamNumber: number): string {
  const words = name.trim().split(/\s+/).filter(Boolean);

  if (words.length >= 2) {
    return `${words[0]![0] ?? ''}${words[1]![0] ?? ''}`.toUpperCase();
  }

  if (words.length === 1 && words[0]!.length >= 2) {
    return words[0]!.slice(0, 2).toUpperCase();
  }

  return String(teamNumber).slice(-2);
}

export function TeamAvatar({ teamNumber, name, imageUrl, size = 'sm', className }: TeamAvatarProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(imageUrl) && !failed;

  useEffect(() => {
    setFailed(false);
  }, [imageUrl, teamNumber]);

  const sizeClass = size === 'md' ? 'team-avatar-md' : 'team-avatar-sm';

  return (
    <span
      className={['team-avatar', sizeClass, className].filter(Boolean).join(' ')}
      aria-hidden={!showImage}
      title={showImage ? `${name} (Team ${teamNumber})` : undefined}
    >
      {showImage ? (
        <img
          src={imageUrl!}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="team-avatar-fallback">{initialsFromName(name, teamNumber)}</span>
      )}
    </span>
  );
}
