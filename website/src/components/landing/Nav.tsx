import Link from '@docusaurus/Link';
import {
  Logo, Button, Icon, Flex,
} from '@heph/uikit';
import { GITHUB_URL, GITHUB_LABEL } from '../../constants';
import { useLatestVersion } from '../../hooks/useLatestVersion';

const STATUS_TAIL = ['MIT LICENSE', 'OPEN SOURCE'];

/** Technical status strip + minimal mono nav. */
export function Nav() {
  const { version } = useLatestVersion();
  const status = [version ? `v${version}` : 'v…', ...STATUS_TAIL];
  return (
    <div style={{ background: 'var(--paper)', position: 'relative', zIndex: 1 }}>
      {/* technical status strip */}
      <div
        className="heph-nav-status"
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 30,
          borderBottom: '1px solid var(--hair)',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--faint)',
          letterSpacing: '0.06em',
        }}
      >
        {status.map((t, i) => (
          <span
            key={t}
            style={{
              padding: '0 16px',
              borderRight: '1px solid var(--hair)',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              color: i === status.length - 1 ? 'var(--ac)' : 'var(--faint)',
            }}
          >
            {t}
          </span>
        ))}
        <span
          className="heph-nav-ghlabel"
          style={{
            marginLeft: 'auto',
            padding: '0 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            height: '100%',
            color: 'var(--faint)',
          }}
        >
          {GITHUB_LABEL}
        </span>
      </div>

      {/* main nav */}
      <nav
        className="heph-nav-main"
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          height: 66,
          borderBottom: '1px solid var(--hair)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '0 24px',
            height: '100%',
            borderRight: '1px solid var(--hair)',
          }}
        >
          <Logo height={26} />
        </div>
        <div className="heph-nav-docs" style={{ display: 'flex', height: '100%' }}>
          <Link
            to="/docs"
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0 18px',
              fontFamily: 'var(--font-mono)',
              fontSize: 12.5,
              letterSpacing: '0.08em',
              color: 'var(--muted)',
              textDecoration: 'none',
              borderRight: '1px solid var(--hair)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--ink)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)'; }}
            onFocus={(e) => { e.currentTarget.style.color = 'var(--ink)'; }}
            onBlur={(e) => { e.currentTarget.style.color = 'var(--muted)'; }}
          >
            DOCS
          </Link>
        </div>
        <Flex className="heph-nav-actions" align="center" gap={16} style={{ marginLeft: 'auto', paddingRight: 18 }}>
          {/* Star count hidden for now (no real number yet); flip display to
              'inline-flex' to show it again. */}
          <a
            href={GITHUB_URL}
            style={{
              display: 'none',
              alignItems: 'center',
              gap: 7,
              fontFamily: 'var(--font-mono)',
              fontSize: 12.5,
              color: 'var(--muted)',
              textDecoration: 'none',
            }}
          >
            <Icon name="star" size={14} />
            {' '}
            14.2k
          </a>
          <span className="heph-nav-source">
            <Button variant="secondary" size="sm" icon="github" href={GITHUB_URL}>Source</Button>
          </span>
          <Button variant="primary" size="sm" iconRight="arrow-right" href="/docs">Get started</Button>
        </Flex>
      </nav>
    </div>
  );
}
