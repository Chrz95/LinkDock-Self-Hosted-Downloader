import { WORKSPACE_PAGE, type WorkspaceNavigationProps } from './navigation';

/**
 * Gives collection and preferences pages their own clear title and scope.
 * @param {WorkspaceNavigationProps} props - Current page.
 * @param {WorkspacePage} props.page - Library or settings route.
 * @returns {JSX.Element} Visible page heading and descriptive introduction.
 */
export function WorkspaceHeading({ page }: WorkspaceNavigationProps) {
  const library = page === WORKSPACE_PAGE.library;
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">
          <span className="tiny-line" />
          {library ? 'YOUR COLLECTION, IN ORDER' : 'MAKE IT YOURS'}
        </p>
        <h1>
          {library ? 'Download library' : 'Settings'}
          <span>.</span>
        </h1>
        <p>
          {library
            ? 'Everything saved, and everything on the way.'
            : 'One place for your station, your downloads and this device.'}
        </p>
      </div>
    </div>
  );
}
