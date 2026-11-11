import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';

/** Speaker icon — the exact SVG paths the web app uses for its round speak buttons. */
export function SpeakerIcon({ size = 34 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M3.5 9.2v5.6c0 .8.7 1.5 1.5 1.5h3.4L14 20.6c.6.5 1.6.1 1.6-.8V4.2c0-.9-1-1.3-1.6-.8L8.4 7.7H5c-.8 0-1.5.7-1.5 1.5Z"
        fill="#ffffff"
      />
      <Path
        d="M17.6 9.1c1.1 1.7 1.1 4.1 0 5.8"
        stroke="#ffffff"
        strokeWidth={1.9}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M20 6.4c2.2 3.3 2.2 7.9 0 11.2"
        stroke="#ffffff"
        strokeWidth={1.9}
        strokeLinecap="round"
        fill="none"
        opacity={0.65}
      />
    </Svg>
  );
}

function strokeProps(color: string) {
  return {
    stroke: color,
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
}

export function HomeIcon({ size = 22, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3.5 11.2 12 4l8.5 7.2" {...strokeProps(color)} />
      <Path d="M5.8 9.6V20h12.4V9.6" {...strokeProps(color)} />
      <Path d="M9.8 20v-5.4h4.4V20" {...strokeProps(color)} />
    </Svg>
  );
}

export function BookIcon({ size = 22, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 6.2C10.4 4.7 8.2 4 5.5 4c-.8 0-1.5.1-2 .2v13.6c.5-.1 1.2-.2 2-.2 2.7 0 4.9.7 6.5 2.2 1.6-1.5 3.8-2.2 6.5-2.2.8 0 1.5.1 2 .2V4.2c-.5-.1-1.2-.2-2-.2-2.7 0-4.9.7-6.5 2.2Z" {...strokeProps(color)} />
      <Path d="M12 6.2v13.6" {...strokeProps(color)} />
    </Svg>
  );
}

/** Gear icon for the floating Settings button (grown-ups corner). */
export function GearIcon({ size = 24, color }: { size?: number; color: string }) {
  const spokes = [0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
    const rad = (deg * Math.PI) / 180;
    const x1 = 12 + 4.4 * Math.cos(rad);
    const y1 = 12 + 4.4 * Math.sin(rad);
    const x2 = 12 + 8.8 * Math.cos(rad);
    const y2 = 12 + 8.8 * Math.sin(rad);
    return `M${x1.toFixed(2)} ${y1.toFixed(2)} ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  });
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d={spokes.join(' ')}
        stroke={color}
        strokeWidth={2.8}
        strokeLinecap="round"
        fill="none"
      />
      <Circle cx={12} cy={12} r={5.6} stroke={color} strokeWidth={2.1} fill="none" />
      <Circle cx={12} cy={12} r={1.7} fill={color} />
    </Svg>
  );
}

export function PersonIcon({ size = 22, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={8} r={3.8} {...strokeProps(color)} />
      <Path d="M4.8 20.2c.8-3.6 3.7-5.4 7.2-5.4s6.4 1.8 7.2 5.4" {...strokeProps(color)} />
    </Svg>
  );
}
