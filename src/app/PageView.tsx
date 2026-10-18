import { Activity, type ReactNode } from 'react';

interface PageViewProps {
  active: boolean;
  children: ReactNode;
}
/**
 * Retains local drafts and filters while inactive pages release their effects and stay inaccessible.
 * @param {PageViewProps} props - Visibility and page contents.
 * @param {boolean} props.active - Whether this is the selected page.
 * @param {ReactNode} props.children - State-preserving page subtree.
 * @returns {JSX.Element} React visibility boundary with effect cleanup on navigation.
 */
export function PageView({ active, children }: PageViewProps) {
  return <Activity mode={active ? 'visible' : 'hidden'}>{children}</Activity>;
}
