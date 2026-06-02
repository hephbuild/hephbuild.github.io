import type { SyntheticEvent } from 'react';
import Link from '@docusaurus/Link';
import {
  Logo, Button, Cross, Coord, Title,
} from '@heph/uikit';
import { GITHUB_URL, GITHUB_LABEL } from '../../constants';

interface FooterLink { label: string; href: string; }
interface FooterCol { h: string; items: FooterLink[]; }

const COLS: FooterCol[] = [
  {
    h: 'PRODUCT',
    items: [
      { label: 'Overview', href: '/docs' },
      { label: 'Remote cache', href: '/docs/concepts/targets' },
      { label: 'Reproducibility', href: '/docs/concepts/reproducibility' },
      { label: 'Changelog', href: `${GITHUB_URL}/releases` },
    ],
  },
  {
    h: 'DOCS',
    items: [
      { label: 'Quickstart', href: '/docs' },
      { label: 'Targets & rules', href: '/docs/concepts/targets' },
      { label: 'Reproducibility', href: '/docs/concepts/reproducibility' },
      { label: 'CLI reference', href: '/docs/reference/cli' },
    ],
  },
  {
    h: 'PROJECT',
    items: [
      { label: 'GitHub', href: GITHUB_URL },
      { label: 'Security', href: `${GITHUB_URL}/security` },
      { label: 'Status', href: `${GITHUB_URL}/actions` },
      { label: 'License — MIT', href: `${GITHUB_URL}/blob/main/LICENSE` },
    ],
  },
];

// Covers both pointer (mouse enter/leave) and keyboard (focus/blur) so the
// cobalt tint is visible to keyboard users too (WCAG 2.4.7).
function tintIn(e: SyntheticEvent<HTMLAnchorElement>): void {
  e.currentTarget.style.color = 'var(--ac)';
}
function tintOut(e: SyntheticEvent<HTMLAnchorElement>): void {
  e.currentTarget.style.color = 'var(--ink-2)';
}

function FooterItem({ label, href }: FooterLink) {
  const style = {
    fontSize: 13.5,
    color: 'var(--ink-2)',
    textDecoration: 'none',
    fontFamily: 'var(--font-sans)',
  };
  if (href.startsWith('/')) {
    return (
      <Link
        to={href}
        style={style}
        onMouseEnter={tintIn}
        onMouseLeave={tintOut}
        onFocus={tintIn}
        onBlur={tintOut}
      >
        {label}
      </Link>
    );
  }
  return (
    <a
      href={href}
      style={style}
      onMouseEnter={tintIn}
      onMouseLeave={tintOut}
      onFocus={tintIn}
      onBlur={tintOut}
    >
      {label}
    </a>
  );
}

/** CTA slab + link columns + reproducible signature. */
export function Footer() {
  return (
    <footer style={{ position: 'relative', background: 'var(--paper)' }}>
      {/* CTA slab */}
      <div
        className="heph-footer-cta"
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '46px 40px',
          borderBottom: '1px solid var(--hair)',
        }}
      >
        <div>
          <Coord style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
          }}
          >
            <Cross size={9} accent />
            FIG.06 · GET STARTED
          </Coord>
          <Title
            level={2}
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: 'clamp(32px, 4vw, 46px)',
              letterSpacing: '-0.03em',
              color: 'var(--ink)',
              marginTop: 14,
              lineHeight: 1,
            }}
          >
            Ship without surprises
            <span style={{ color: 'var(--ac)' }}>.</span>
          </Title>
        </div>
        <div className="heph-footer-cta-actions" style={{ display: 'flex', gap: 0 }}>
          <Button variant="secondary" icon="github" href={GITHUB_URL}>Star on GitHub</Button>
          <Button variant="primary" iconRight="arrow-right" href="/docs" style={{ marginLeft: -1 }}>
            Install heph
          </Button>
        </div>
      </div>

      {/* columns */}
      <div className="heph-footer-cols" style={{ display: 'grid', gridTemplateColumns: '1.5fr repeat(3, 1fr)' }}>
        <div style={{ padding: '32px 40px', borderRight: '1px solid var(--hair)' }}>
          <Logo height={24} />
          <p style={{
            fontSize: 13, lineHeight: 1.6, color: 'var(--muted)', margin: '16px 0 0', maxWidth: 240,
          }}
          >
            Open-source build system & task orchestrator.
          </p>
        </div>
        {COLS.map((c, idx) => (
          <div
            key={c.h}
            style={{
              position: 'relative',
              padding: '32px 26px',
              borderRight: idx < 2 ? '1px solid var(--hair)' : 'none',
            }}
          >
            <div style={{
              position: 'absolute', top: 0, left: 0, transform: 'translate(-50%,-50%)', zIndex: 2,
            }}
            >
              <Cross size={11} />
            </div>
            <Coord style={{ color: 'var(--faint)' }}>{c.h}</Coord>
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 11, marginTop: 16,
            }}
            >
              {c.items.map((item) => (
                <FooterItem key={item.label} label={item.label} href={item.href} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div
        className="heph-footer-bar"
        style={{
          borderTop: '1px solid var(--hair)',
          padding: '15px 40px',
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: 'var(--font-mono)',
          fontSize: 11.5,
          color: 'var(--faint)',
          letterSpacing: '0.04em',
        }}
      >
        <span>{`© ${new Date().getFullYear()} HEPH · MIT`}</span>
        <span style={{ color: 'var(--muted)' }}>{GITHUB_LABEL}</span>
      </div>
    </footer>
  );
}
