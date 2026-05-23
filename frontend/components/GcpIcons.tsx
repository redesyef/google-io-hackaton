"use client";

/**
 * GCP-style icons for the canvas. Hex-framed glyphs in service brand colors,
 * matching the visual language of Google Cloud product icons.
 */

import type { ReactNode } from "react";

type IconProps = { size?: number };

const COLORS = {
  blue: "#4285F4",
  green: "#34A853",
  yellow: "#FBBC04",
  red: "#EA4335",
  purple: "#A142F4",
  cyan: "#24C1E0",
  gray: "#9AA0A6",
  orange: "#F09300",
} as const;

function HexFrame({ color, children, size = 22 }: { color: string; children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 1.5L21.5 7v10L12 22.5 2.5 17V7L12 1.5z"
        fill={color}
        fillOpacity="0.14"
        stroke={color}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <g stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none">
        {children}
      </g>
    </svg>
  );
}

export function ComputeIcon({ size }: IconProps) {
  return (
    <HexFrame color={COLORS.blue} size={size}>
      <rect x="7.5" y="8.5" width="9" height="7" rx="1" />
      <line x1="9.5" y1="8.5" x2="9.5" y2="6.5" />
      <line x1="14.5" y1="8.5" x2="14.5" y2="6.5" />
      <line x1="9.5" y1="17.5" x2="9.5" y2="15.5" />
      <line x1="14.5" y1="17.5" x2="14.5" y2="15.5" />
      <line x1="10" y1="11" x2="14" y2="11" />
    </HexFrame>
  );
}

export function StorageIcon({ size }: IconProps) {
  return (
    <HexFrame color={COLORS.yellow} size={size}>
      <path d="M8 9 l1 7 h6 l1 -7 z" />
      <line x1="7.5" y1="9" x2="16.5" y2="9" />
    </HexFrame>
  );
}

export function SqlIcon({ size }: IconProps) {
  return (
    <HexFrame color={COLORS.blue} size={size}>
      <ellipse cx="12" cy="8.5" rx="4" ry="1.5" />
      <path d="M8 8.5 v7 a4 1.5 0 0 0 8 0 v-7" />
      <path d="M8 12 a4 1.5 0 0 0 8 0" />
    </HexFrame>
  );
}

export function LoadBalancerIcon({ size }: IconProps) {
  return (
    <HexFrame color={COLORS.blue} size={size}>
      <circle cx="12" cy="7.5" r="1.4" />
      <circle cx="7.5" cy="15" r="1.4" />
      <circle cx="12" cy="15" r="1.4" />
      <circle cx="16.5" cy="15" r="1.4" />
      <line x1="12" y1="9" x2="8" y2="13.5" />
      <line x1="12" y1="9" x2="12" y2="13.5" />
      <line x1="12" y1="9" x2="16" y2="13.5" />
    </HexFrame>
  );
}

export function DiskIcon({ size }: IconProps) {
  return (
    <HexFrame color={COLORS.gray} size={size}>
      <ellipse cx="12" cy="8.5" rx="4" ry="1.5" />
      <line x1="8" y1="8.5" x2="8" y2="13.5" />
      <line x1="16" y1="8.5" x2="16" y2="13.5" />
      <ellipse cx="12" cy="13.5" rx="4" ry="1.5" />
    </HexFrame>
  );
}

export function NetworkIcon({ size }: IconProps) {
  return (
    <HexFrame color={COLORS.cyan} size={size}>
      <path d="M7 11 a5 5 0 0 1 10 0" />
      <path d="M9 13 a3 3 0 0 1 6 0" />
      <circle cx="12" cy="15.5" r="0.9" fill={COLORS.cyan} />
    </HexFrame>
  );
}

export function IamIcon({ size }: IconProps) {
  return (
    <HexFrame color={COLORS.purple} size={size}>
      <circle cx="12" cy="10" r="2" />
      <path d="M8 16 a4 4 0 0 1 8 0" />
    </HexFrame>
  );
}

export function FirewallIcon({ size }: IconProps) {
  return (
    <HexFrame color={COLORS.red} size={size}>
      <path d="M12 7 l4 2 v3 c0 3 -2 4 -4 5 c-2 -1 -4 -2 -4 -5 v-3 z" />
    </HexFrame>
  );
}

export function CacheIcon({ size }: IconProps) {
  return (
    <HexFrame color={COLORS.red} size={size}>
      <path d="M13 7 l-4 6 h3 l-1 4 4 -6 h-3 z" fill={COLORS.red} fillOpacity="0.85" stroke="none" />
    </HexFrame>
  );
}

export function BackupIcon({ size }: IconProps) {
  return (
    <HexFrame color={COLORS.green} size={size}>
      <path d="M9 9 h6 v6 h-6 z" />
      <path d="M11 11 h2 v2 h-2 z" />
    </HexFrame>
  );
}

export function DatabaseIcon({ size }: IconProps) {
  return (
    <HexFrame color={COLORS.blue} size={size}>
      <rect x="8" y="9" width="8" height="6" rx="0.5" />
      <line x1="8" y1="11" x2="16" y2="11" />
      <line x1="8" y1="13" x2="16" y2="13" />
    </HexFrame>
  );
}

export function LifecycleIcon({ size }: IconProps) {
  return (
    <HexFrame color={COLORS.orange} size={size}>
      <path d="M9 9 a4 4 0 1 1 0 6" />
      <polyline points="9,7 9,9 11,9" />
    </HexFrame>
  );
}

export function CdnIcon({ size }: IconProps) {
  return (
    <HexFrame color={COLORS.cyan} size={size}>
      <circle cx="12" cy="12" r="4" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <ellipse cx="12" cy="12" rx="2" ry="4" />
    </HexFrame>
  );
}

export function SslIcon({ size }: IconProps) {
  return (
    <HexFrame color={COLORS.green} size={size}>
      <rect x="8.5" y="11" width="7" height="5" rx="0.5" />
      <path d="M10 11 v-1.5 a2 2 0 0 1 4 0 v1.5" />
    </HexFrame>
  );
}

export function ServiceIcon({ size }: IconProps) {
  return (
    <HexFrame color={COLORS.blue} size={size}>
      <circle cx="12" cy="12" r="3" />
      <line x1="12" y1="7" x2="12" y2="9" />
      <line x1="12" y1="15" x2="12" y2="17" />
      <line x1="7" y1="12" x2="9" y2="12" />
      <line x1="15" y1="12" x2="17" y2="12" />
    </HexFrame>
  );
}

export function PolicyIcon({ size }: IconProps) {
  return (
    <HexFrame color={COLORS.red} size={size}>
      <path d="M12 7 l4 1.5 v4 c0 3 -2 4.5 -4 5 c-2 -0.5 -4 -2 -4 -5 v-4 z" />
      <path d="M10 12 l1.5 1.5 l3 -3" />
    </HexFrame>
  );
}

export function CloudIcon({ size }: IconProps) {
  return (
    <HexFrame color={COLORS.gray} size={size}>
      <path d="M8 13 a3 3 0 0 1 3 -3 a3 3 0 0 1 5 1 a2.5 2.5 0 0 1 0 5 h-7 a2 2 0 0 1 -1 -3 z" />
    </HexFrame>
  );
}

export const ICON_REGISTRY: Record<string, { icon: (p: IconProps) => ReactNode; color: string; layer: number }> = {
  load_balancer: { icon: LoadBalancerIcon, color: COLORS.blue, layer: 0 },
  compute: { icon: ComputeIcon, color: COLORS.green, layer: 1 },
  sql: { icon: SqlIcon, color: COLORS.blue, layer: 2 },
  storage: { icon: StorageIcon, color: COLORS.yellow, layer: 3 },
  cache: { icon: CacheIcon, color: COLORS.red, layer: 1 },
  disk: { icon: DiskIcon, color: COLORS.gray, layer: 99 },
  network: { icon: NetworkIcon, color: COLORS.cyan, layer: 99 },
  iam: { icon: IamIcon, color: COLORS.purple, layer: 99 },
  firewall: { icon: FirewallIcon, color: COLORS.red, layer: 99 },
  backup: { icon: BackupIcon, color: COLORS.green, layer: 99 },
  database: { icon: DatabaseIcon, color: COLORS.blue, layer: 99 },
  lifecycle: { icon: LifecycleIcon, color: COLORS.orange, layer: 99 },
  cdn: { icon: CdnIcon, color: COLORS.cyan, layer: 99 },
  ssl: { icon: SslIcon, color: COLORS.green, layer: 99 },
  service: { icon: ServiceIcon, color: COLORS.blue, layer: 99 },
  policy: { icon: PolicyIcon, color: COLORS.red, layer: 99 },
};

export function iconMetaFor(kind: string) {
  return ICON_REGISTRY[kind] ?? { icon: CloudIcon, color: COLORS.gray, layer: 50 };
}
