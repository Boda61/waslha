import React, { useState } from 'react';

const HebdItemImage = ({ item, className = '', style = {} }) => {
  const [hasError, setHasError] = useState(false);

  if (!item) return null;

  const showFallback = !item.image_url || hasError;

  // Common wrapper styles
  const wrapperStyle = {
    width: '100%',
    aspectRatio: '1 / 1',
    position: 'relative',
    overflow: 'hidden',
    ...style,
  };

  if (showFallback) {
    return (
      <div
        className={`hebd-item-image hebd-item-image--fallback ${className}`}
        style={wrapperStyle}
      >
        <span
          className="hebd-item-emoji"
          style={{
            fontSize: 'clamp(3rem, 8vw, 6rem)',
            lineHeight: '1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            background: 'rgba(0,0,0,0.05)',
          }}
        >
          {item.image_emoji || '?'}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`hebd-item-image hebd-item-image--loaded ${className}`}
      style={wrapperStyle}
    >
      <img
        src={item.image_url}
        alt={item.answer || 'Hebd item image'}
        className="hebd-item-img"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          objectPosition: 'center',
          display: 'block',
          backgroundColor: '#000',
        }}
        loading="lazy"
        onError={() => setHasError(true)}
        onLoad={() => setHasError(false)}
      />
    </div>
  );
};

export default HebdItemImage;
