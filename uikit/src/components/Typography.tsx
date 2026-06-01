import { Typography as AntTypography } from 'antd';

/**
 * Typography proxies. Re-exported straight from antd so headings and prose pick
 * up the Blueprint theme (Plex Sans, ink color, zero title margins). Consumers
 * import `{ Title, Text, Paragraph }` from the uikit, never from antd.
 */
export const { Title, Text, Paragraph } = AntTypography;
