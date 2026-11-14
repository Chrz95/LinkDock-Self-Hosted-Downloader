/** Returns the storage keys for the station and its browser download settings.
 * @param {boolean} incognito - Browser mode that owns the download or popup.
 * @returns {{station: string, capture: string, result: string, overlays: string}} Keys scoped to that browser mode.
 */
function downloadCaptureKeys(incognito) {
  return incognito
    ? {
        station: 'stationIncognito',
        capture: 'captureDownloadsIncognito',
        result: 'lastCaptureIncognito',
        overlays: 'downloadOverlaysIncognito',
      }
    : { station: 'station', capture: 'captureDownloads', result: 'lastCapture', overlays: 'downloadOverlays' };
}

Object.assign(globalThis.LinkDockCompanion, { downloadCaptureKeys });
