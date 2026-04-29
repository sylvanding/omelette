import { useState } from 'react';
import { Star } from 'lucide-react';

interface StarRatingProps {
  value: number;
  onChange?: (rating: number) => void;
  readOnly?: boolean;
  size?: number;
}

export function StarRating({ value, onChange, readOnly = false, size = 16 }: StarRatingProps) {
  const [hover, setHover] = useState(0);

  return (
    <div className="inline-flex items-center gap-0.5" role="group" aria-label={`Rating: ${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readOnly}
          className={`${readOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110'} transition-transform`}
          onClick={() => onChange?.(star)}
          onMouseEnter={() => !readOnly && setHover(star)}
          onMouseLeave={() => !readOnly && setHover(0)}
          aria-label={`${star} star${star !== value ? '' : ' (current)'}`}
        >
          <Star
            width={size}
            height={size}
            className={
              star <= (hover || value)
                ? 'fill-amber-400 text-amber-400'
                : 'text-muted-foreground/40'
            }
          />
        </button>
      ))}
    </div>
  );
}
