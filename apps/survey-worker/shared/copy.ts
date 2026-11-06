// Customer-facing English copy for the survey (SPEC M06, ERROR HANDLING A-86). Shared by the
// server renderer and the island so every string is defined once and can be translated later.

export const BASE = '/customerfeedback';

export const COPY = {
  siteTitle: 'Serene Insurance feedback',
  logoAlt: 'Serene Insurance',
  step: (n: number, total: number) => `Step ${n} of ${total}`,
  questionOf: (n: number, total: number) => `Question ${n} of ${total}`,
  section: (n: number, total: number) => `Section ${n} of ${total}`,
  back: 'Back',
  continue: 'Continue',
  submit: 'Submit feedback',
  sending: 'Sending…',
  submitting: 'Submitting your feedback…',
  received: 'Feedback received',
  resumeHeading: 'Welcome back',
  resumeStarted: (when: string | null) =>
    when ? `You started this form on ${when}.` : 'You started this form earlier.',
  resumeBody: 'Your answers so far are saved. Would you like to finish it?',
  resumeContinue: 'Pick up where you left off',
  resumeNew: 'Start a new feedback form',
  optional: '(optional)',
  autoAdvance: 'Choosing an answer moves you to the next question.',
  selectBranch: 'Select a branch',
  privacyLink: 'Privacy notice',
  counter: (n: number, max: number) => `${n} / ${max}`,
  revealed: {
    branch: 'Branch question added',
    phone: 'Mobile number and first name added',
  } as Record<string, string>,
  noJsIntro: 'Please answer the five sections below, then tap Submit feedback at the end.',
  noJsHint: {
    branch: 'Only if you chose "Walk-in at a branch office" (required) or "Other" above.',
    channel_other: 'Only if you chose "Other" above.',
    branch_other: 'Only if you chose "Other branch" above.',
    product_other: 'Only if you chose "Other" above.',
    factor_other: 'Only if you chose "Other" above.',
    phone: 'Only if you switched on "You may contact me". Required then.',
    first_name: 'Only if you switched on "You may contact me".',
  } as Record<string, string>,
  errorSummary: 'Please check these answers:',
  fieldErrors: {
    channel: { required: 'Please choose how you got your policy.' },
    branch: { required: 'Please choose the branch that issued your policy.' },
    product: { required: 'Please choose the type of policy you bought.' },
    csat: { required: 'Please choose how satisfied you are.' },
    ces: { required: 'Please choose how easy it was.' },
    nps: { required: 'Please choose a number from 0 to 10.' },
    factor: {
      required: 'Please choose what we should improve. If nothing, choose “Nothing, I am satisfied”.',
    },
    phone: {
      required: 'Please enter a Ghana mobile number, e.g. 024 123 4567, or switch off the contact option.',
      invalid_phone:
        'Please enter a Ghana mobile number, e.g. 024 123 4567, or switch off the contact option.',
    },
  } as Record<string, Record<string, string>>,
  genericErrors: {
    required: 'Please answer this question.',
    invalid_option: 'Please choose one of the options.',
    out_of_range: 'Please choose one of the options.',
    too_long: 'Please shorten your answer.',
    invalid_type: 'Please check this answer.',
    invalid_phone: 'Please enter a Ghana mobile number, e.g. 024 123 4567.',
  } as Record<string, string>,
  offline:
    "You seem to be offline. Your answers are saved on this device — tap Submit again when you're connected.",
  serverError: "We couldn't send your feedback just now. Your answers are safe — please try again.",
  verificationFailed: "Please tap Submit again so we can confirm you're not a robot.",
  verificationVisible: "Please complete the quick check below so we know you're not a robot.",
  rateLimited: 'Please wait a moment and try again.',
  sessionTimedOut: 'Your session timed out. Please check your answers and tap Submit feedback again.',
  thanksHeading: 'Thank you! Your feedback has been received.',
  thanksReference: 'Reference',
  thanksBody: 'We read every response and use it to improve our service.',
  thanksContact: (masked: string) => `Our customer experience team may call you on ${masked}.`,
  shareMore: 'Share more feedback',
  alreadyShared: 'You’ve already shared your feedback — thank you!',
  alreadySharedRef: (ref: string) => `Reference ${ref}`,
  unavailableHeading: 'We can’t take feedback right now.',
  unavailableBody: 'Please try again a little later.',
  tryAgain: 'Try again',
  notFoundHeading: 'This page doesn’t exist.',
  notFoundBody: 'You can still tell us how we did.',
  startSurvey: 'Start the survey',
};

/** The customer message for one field error. */
export function fieldMessage(field: string, code: string): string {
  return COPY.fieldErrors[field]?.[code] ?? COPY.genericErrors[code] ?? 'Please answer this question.';
}
