import type { IconProps } from './Icon.types';
import { ICON_PATH } from './iconPaths';

/**
 * Renders consistent decorative line icons; controls supply their own accessible name.
 * @param {IconProps} props - Icon presentation.
 * @param {keyof typeof ICON_PATH} props.name - Symbol to render.
 * @param {string} [props.className] - Optional CSS class.
 * @returns {JSX.Element} Decorative SVG.
 */
export function Icon({ name, className }: IconProps) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICON_PATH[name]} />
    </svg>
  );
}
