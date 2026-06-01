import { Button as AntButton } from 'antd';
import {
  useState, type CSSProperties, type ReactNode,
} from 'react';
import { Icon, type IconName } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps {
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
  onClick?: () => void;
  /** When set, the button renders as an anchor (antd) pointing here. */
  href?: string;
  target?: string;
  style?: CSSProperties;
}

/**
 * Squared, monospaced CTA. Wraps antd's `Button` for focus/keyboard/ripple
 * behaviour while pinning the exact Blueprint look (ink fill, cobalt hover,
 * zero radius). Variants map to inline styles so the visual is deterministic
 * and never fights antd's cascade; hover is driven by local state.
 */
const VARIANT_BASE: Record<ButtonVariant, CSSProperties> = {
  primary: { background: 'var(--ink)', color: 'var(--paper)', borderColor: 'var(--ink)' },
  secondary: { background: 'transparent', color: 'var(--ink)', borderColor: 'var(--hair-strong)' },
  ghost: { background: 'transparent', color: 'var(--muted)', borderColor: 'transparent' },
};

const VARIANT_HOVER: Record<ButtonVariant, CSSProperties> = {
  primary: { background: 'var(--ac)', borderColor: 'var(--ac)' },
  secondary: { borderColor: 'var(--ink)' },
  ghost: { color: 'var(--ink)' },
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  onClick,
  href,
  target,
  style,
}: ButtonProps) {
  const [active, setActive] = useState(false);
  const base: CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontWeight: 500,
    borderRadius: 0,
    letterSpacing: '0.02em',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    cursor: 'pointer',
    border: '1px solid',
    lineHeight: 1,
    whiteSpace: 'nowrap',
    height: 'auto',
    transition: 'all .14s var(--ease-out)',
    fontSize: size === 'sm' ? 12.5 : 13.5,
    padding: size === 'sm' ? '9px 14px' : '13px 19px',
    ...VARIANT_BASE[variant],
    // Mirror the hover treatment on keyboard focus so the control stays
    // visible for non-pointer users (WCAG 2.4.7), on top of antd's focus ring.
    ...(active ? VARIANT_HOVER[variant] : {}),
    ...style,
  };
  const iconSize = size === 'sm' ? 14 : 16;
  return (
    <AntButton
      type={variant === 'ghost' ? 'text' : 'default'}
      onClick={onClick}
      href={href}
      target={target}
      style={base}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
    >
      {icon ? <Icon name={icon} size={iconSize} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} size={iconSize} /> : null}
    </AntButton>
  );
}
