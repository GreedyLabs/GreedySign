/** @enum {string} */
export const MergeMode = {
  COMBINED: 'combined',
  INDIVIDUAL: 'individual',
};

/** @enum {string} */
export const InviteStatus = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
};

/** @enum {string} */
export const SigningStatus = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
};

/**
 * @typedef {Object} DocumentShare
 * @property {string} share_id
 * @property {string} invitee_id
 * @property {string} invitee_name
 * @property {string} invitee_email
 * @property {InviteStatus} invite_status
 * @property {SigningStatus} signing_status
 * @property {string|null} completed_at
 * @property {number} placement_count
 */

/**
 * @typedef {Object} Document
 * @property {string} id
 * @property {string} name
 * @property {number} size_bytes
 * @property {number} page_count
 * @property {string} created_at
 * @property {string} updated_at
 * @property {string} owner_name
 * @property {string} owner_id
 * @property {boolean} is_owner
 * @property {MergeMode} merge_mode
 * @property {SigningStatus} my_signing_status
 */
