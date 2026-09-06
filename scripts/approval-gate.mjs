/**
 * Content-hash-based approval invalidation, used by skills whose publish/
 * send step requires prior explicit approval of the EXACT text (e.g.
 * ush-work-announcement): "any material edit after approval resets
 * approval." A caller records the hash of the exact text a user approved;
 * this compares it against the hash of the text about to be sent. No
 * approval, or any drift between the two, is not valid.
 */
export function isApprovalValid({ approvedContentHash, currentContentHash }) {
  return Boolean(approvedContentHash) && approvedContentHash === currentContentHash;
}
