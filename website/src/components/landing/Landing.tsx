import BrowserOnly from '@docusaurus/BrowserOnly';
import { Nav } from './Nav';
import { Hero } from './Hero';
import { Features, AsciiGraph, MetricsBand } from './Features';
import { Footer } from './Footer';
import { Plasma } from './Plasma';
import './landing.css';

/**
 * The heph marketing landing page. Composes the blueprint sections inside the
 * 1200px hairline frame, over a faint full-viewport ambient plasma. The
 * `.heph-landing` marker class lets custom.css hide Docusaurus' default navbar
 * and footer on this route, since the page brings its own bespoke chrome.
 */
export function Landing() {
  return (
    <div className="heph-landing">
      <div className="heph-ambient-plasma">
        <BrowserOnly>
          {() => (
            <Plasma
              height={window.innerHeight}
              cell={15}
              speed={0.5}
              interactive
              passthrough
              accent={false}
              ramp="fade"
              opacity={0.38}
              warp={0.7}
            />
          )}
        </BrowserOnly>
      </div>
      <div className="heph-frame">
        <Nav />
        <Hero />
        <Features />
        <AsciiGraph />
        <MetricsBand />
        <Footer />
      </div>
    </div>
  );
}
