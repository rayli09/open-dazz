// Match the same LUT in local/dev and content-addressed production builds.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export function lutRoute(path) {
  const hash = createHash('sha256').update(readFileSync(new URL(`../${path}`, import.meta.url))).digest('hex');
  return url => decodeURIComponent(url.pathname).endsWith(`/${path}`) || url.pathname.endsWith(`/${hash}.cube.gz`);
}
