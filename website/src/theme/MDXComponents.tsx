/**
 * MDX component overrides.
 *
 * `table` gets a scroll container. The blueprint styles tables as full-width
 * hairline grids (`display: table; width: 100%`), which replaces Infima's
 * scrollable default — so a reference table whose cells hold unbreakable code
 * (`map[string, string]`, `"1.26.4/linux/amd64"`) had nowhere to go and pushed
 * the whole page sideways. Wrapping keeps the full-width look when the table
 * fits and scrolls only the table when it does not.
 */
import type { ComponentProps, ReactNode } from 'react';
import MDXComponents from '@theme-original/MDXComponents';

function Table(props: ComponentProps<'table'>): ReactNode {
  return (
    <div className="markdownTableScroll">
      {/* eslint-disable-next-line react/jsx-props-no-spreading */}
      <table {...props} />
    </div>
  );
}

export default {
  ...MDXComponents,
  table: Table,
};
