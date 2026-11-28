import React from 'react';

interface BoxBinAiIconProps {
  size?: number;
  className?: string;
  /** Renders the full golden-yellow squircle badge background when true. */
  withBadge?: boolean;
  /** Hides the top-right sparkle accent when rendered at very small sizes. */
  showSparkle?: boolean;
}

/**
 * BoxBin AI Assistant mascot icon (front squirrel face + golden accents + sparkle).
 * Matches the mobile React Native SVG in Binventory/components/copilot/BoxBinAiIcon.tsx.
 */
export const BoxBinAiIcon: React.FC<BoxBinAiIconProps> = ({
  size = 24,
  className,
  withBadge = false,
  showSparkle = true,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    {withBadge && (
      <rect x="2" y="2" width="60" height="60" rx="16" fill="#F5B800" />
    )}

    {/* Top-right white 4-point sparkle */}
    {showSparkle && (
      <path
        d="M52 7.5C52.8 11.4 54.6 13.2 58.5 14C54.6 14.8 52.8 16.6 52 20.5C51.2 16.6 49.4 14.8 45.5 14C49.4 13.2 51.2 11.4 52 7.5Z"
        fill="#FFFFFF"
      />
    )}

    {/* Charcoal squirrel head silhouette with pointed ears & chubby cheeks */}
    <path
      d="M21.2 28.4C19.8 24.4 19.6 18.6 22.8 13.8C23.4 12.9 24.7 13.0 25.3 13.9C27.1 16.5 28.3 19.3 29.0 21.8C30.9 21.4 33.1 21.4 35.0 21.8C35.7 19.3 36.9 16.5 38.7 13.9C39.3 13.0 40.6 12.9 41.2 13.8C44.4 18.6 44.2 24.4 42.8 28.4C44.5 30.8 45.4 33.5 45.6 35.8C48.8 37.6 50.6 40.5 50.2 44.0C49.6 49.4 42.4 53.5 32.0 53.5C21.6 53.5 14.4 49.4 13.8 44.0C13.4 40.5 15.2 37.6 18.4 35.8C18.6 33.5 19.5 30.8 21.2 28.4Z"
      fill="#24262C"
    />

    {/* Golden inner ears */}
    <path
      d="M23.7 17.5C22.4 20.2 22.4 23.6 23.2 25.8C24.7 24.9 26.2 24.1 27.1 23.2C26.5 21.1 25.4 19.1 23.7 17.5Z"
      fill="#F5B800"
    />
    <path
      d="M40.3 17.5C41.6 20.2 41.6 23.6 40.8 25.8C39.3 24.9 37.8 24.1 36.9 23.2C37.5 21.1 38.6 19.1 40.3 17.5Z"
      fill="#F5B800"
    />

    {/* Happy curved-arc white eyes */}
    <path
      d="M21.8 38.2C22.8 35.0 26.2 35.0 27.2 38.2"
      stroke="#FFFFFF"
      strokeWidth="3.2"
      strokeLinecap="round"
    />
    <path
      d="M36.8 38.2C37.8 35.0 41.2 35.0 42.2 38.2"
      stroke="#FFFFFF"
      strokeWidth="3.2"
      strokeLinecap="round"
    />

    {/* Golden-yellow nose with soft top highlight */}
    <path
      d="M28.8 41.3C28.8 40.2 30.1 39.6 32.0 39.6C33.9 39.6 35.2 40.2 35.2 41.3C35.2 42.7 33.4 44.8 32.0 44.8C30.6 44.8 28.8 42.7 28.8 41.3Z"
      fill="#F5B800"
    />
    <ellipse cx="32" cy="41.4" rx="1.6" ry="0.8" fill="#FFE58A" />
  </svg>
);

export default BoxBinAiIcon;
