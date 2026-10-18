/** Native selection works with touch, keyboards and assistive technology. */
export interface LibraryFiltersProps {
  folders: string[];
  tags: [string, string][];
  folder: string;
  tag: string;
  visibleCount: number;
  totalCount: number;
  hasFilters: boolean;
  onFolderChange: (value: string) => void;
  onTagChange: (value: string) => void;
  onReset: () => void;
}
