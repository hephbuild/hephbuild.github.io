import {
  ArrowRight,
  BookOpen,
  Box,
  Check,
  Copy,
  Cpu,
  Database,
  Fingerprint,
  GitBranch,
  Github,
  Play,
  Star,
  Terminal,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import type { CSSProperties } from 'react';

/**
 * Curated Lucide registry — the only icons the brand currently uses. Keeping an
 * explicit allow-list (instead of the full dynamic `icons` map) keeps bundles
 * small and gives callers a typed `name` prop. Add a glyph here when a new
 * surface needs it; consumers never import from `lucide-react` directly.
 */
const REGISTRY = {
  terminal: Terminal,
  'book-open': BookOpen,
  github: Github,
  'arrow-right': ArrowRight,
  star: Star,
  play: Play,
  copy: Copy,
  check: Check,
  fingerprint: Fingerprint,
  box: Box,
  'git-branch': GitBranch,
  database: Database,
  cpu: Cpu,
  workflow: Workflow,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof REGISTRY;

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  stroke?: number;
  style?: CSSProperties;
}

export function Icon({
  name, size = 16, color, stroke = 1.75, style,
}: IconProps) {
  const Glyph = REGISTRY[name];
  return <Glyph size={size} color={color} strokeWidth={stroke} style={style} aria-hidden />;
}
