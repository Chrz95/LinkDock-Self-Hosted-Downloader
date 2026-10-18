import type { ICON_PATH } from './iconPaths';
/** Available icon identity and decorative styling. */
export interface IconProps {
  name: keyof typeof ICON_PATH;
  className?: string;
}
