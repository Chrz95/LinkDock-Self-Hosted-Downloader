export const STATION_BROWSER_PATH = '/api/station-browser';

export interface BrowserLink {
  url: string;
  label: string;
  download: boolean;
}

export interface BrowserPage {
  url: string;
  title: string;
  previewUrl: string;
  links: BrowserLink[];
  file: boolean;
  truncated: boolean;
}
