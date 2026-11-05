/** A message that is safe to show, plus the technical detail for the "Details" disclosure. */
export interface UserFacingError {
  message: string;
  detail?: string | undefined;
}

interface PostgrestLikeError {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

/**
 * Maps database and network errors to plain-language messages (SPEC ERROR HANDLING).
 * RPCs raise user-safe messages for domain errors, so those are shown as they are.
 */
export function toUserError(error: unknown): UserFacingError {
  if (error instanceof TypeError && /fetch/i.test(error.message)) {
    return {
      message: 'You seem to be offline, or the service is unreachable. Check your connection and try again.',
    };
  }
  const e = (error ?? {}) as PostgrestLikeError;
  const detail = [e.code, e.details, e.hint].filter(Boolean).join(' · ') || undefined;
  switch (e.code) {
    case '42501':
      return { message: e.message || "You don't have permission to do this.", detail };
    case 'P0001':
    case 'P0002':
    case '22023':
      return { message: e.message || 'That request could not be completed.', detail };
    case 'PGRST301':
      return { message: 'Your session has expired. Please sign in again.', detail };
    default:
      return {
        message:
          'Something went wrong on our side. Please try again; if it keeps happening, contact your system administrator.',
        detail: [e.message, detail].filter(Boolean).join(' · ') || undefined,
      };
  }
}
