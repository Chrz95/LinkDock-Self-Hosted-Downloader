import { API_PATH, HTTP_METHOD } from '../../../../shared/contracts';
import { BULK_LIBRARY, type BulkLibraryRequest, type BulkLibraryResult } from '../../../../shared/bulkLibrary';
import { requestApi } from '../../../lib/api/requestApi';

/**
 * Sends one explicit reviewed membership through the authenticated JSON endpoint.
 * @param {BulkLibraryRequest} request - Partial organization or confirmed deletion.
 * @returns {Promise<BulkLibraryResult>} Durable edits and individual deletion outcomes.
 */
export function mutateLibrary(request: BulkLibraryRequest): Promise<BulkLibraryResult> {
  return requestApi(`${API_PATH.downloads}${BULK_LIBRARY.path}`, {
    method: HTTP_METHOD.post,
    body: JSON.stringify(request),
  });
}
