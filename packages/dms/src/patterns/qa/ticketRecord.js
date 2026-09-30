// The ticket record's fixed lists. They live in code, the same for every install;
// the datasets hold only each ticket's own values. The install writes these lists
// onto the tickets source's column options, so the datasets admin and the CLI show
// the same values.

// Every status belongs to one kind. Counts, the status strip and any later board
// group by kind, so they work whatever an install's statuses are called.
export const STATUS_KINDS = ['triage', 'active', 'waiting', 'done', 'canceled']

// TransportNY's seven statuses, with the meanings in
// src/themes/transportny/qa_skills/qa-process.md ("Ticket lifecycle").
export const DEFAULT_STATUSES = [
  { value: 'Triage',         kind: 'triage' },   // filed, not yet worked
  { value: 'In progress',    kind: 'active' },
  { value: 'In review',      kind: 'active' },   // fix landed, awaiting confirmation
  { value: 'Needs decision', kind: 'waiting' },  // parked on a human call
  { value: 'Needs data',     kind: 'waiting' },  // parked on dataset/ETL work
  { value: 'Resolved',       kind: 'done' },     // fixed and verified
  { value: 'Closed',         kind: 'canceled' }, // off the board without a fix
]

// Why a closed ticket closed. "Feature request" is a ticket that turned out to ask
// for something new rather than report a defect.
export const OUTCOMES = [
  'Fixed',
  'Workaround',
  'Backlog',
  'Feature request',
  'Out of scope',
  'Duplicate',
  "Won't fix",
]

export function statusKind(status, statuses = DEFAULT_STATUSES) {
  return statuses.find(s => s.value === status)?.kind
}
