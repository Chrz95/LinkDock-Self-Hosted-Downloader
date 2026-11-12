/** Returns the storage keys for the station and its opt-in download capture preference.
 * @param {boolean} incognito - Browser mode that owns the download or popup.
 * @returns {{station: string, capture: string, result: string}} Keys scoped to that browser mode.
 */
function downloadCaptureKeys(incognito) {
  return incognito
    ? { station: 'stationIncognito', capture: 'captureDownloadsIncognito', result: 'lastCaptureIncognito' }
    : { station: 'station', capture: 'captureDownloads', result: 'lastCapture' };
}

Object.assign(globalThis.LinkDockCompanion, { downloadCaptureKeys });
