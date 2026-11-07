// Shared enum constants with NO server dependencies.
// Client components and lib/validations.ts must import from here, never from
// '@/models/*' — importing a model pulls mongoose into the browser bundle,
// where `mongoose.models` is undefined and the page crashes on load.

export const GUARDIAN_RELATIONS = [
  'Father',
  'Mother',
  'Grandparent',
  'Sibling',
  'Uncle',
  'Aunt',
  'Other',
] as const;

export type GuardianRelation = (typeof GUARDIAN_RELATIONS)[number];

export const UNAPPROVED_REASON_CODES = [
  'Relative',
  'Neighbour',
  'Driver/auto',
  'Other',
] as const;

export type UnapprovedReasonCode = (typeof UNAPPROVED_REASON_CODES)[number];
