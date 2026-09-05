import type * as Y from 'yjs'

const DOC_PREFIX = 'trip:'

/** One Yjs document per trip. Never one per day — activities move across days. */
export function docNameForTrip(tripId: string): string {
  return `${DOC_PREFIX}${tripId}`
}

export function tripIdFromDocName(documentName: string): string {
  if (!documentName.startsWith(DOC_PREFIX)) {
    throw new Error(`Unrecognised document name: ${documentName}`)
  }
  return documentName.slice(DOC_PREFIX.length)
}

/** Trip-level fields: title, summary, destination, dates, coverImageKey. */
export function getMeta(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap('meta')
}

/**
 * Days in display order. Positional by design — a day's calendar date is
 * derived from trip.startDate plus its index, never stored. See PRD §4.2.
 */
export function getDays(doc: Y.Doc): Y.Array<Y.Map<unknown>> {
  return doc.getArray('days')
}

/** Activities keyed by id, so a drag can look up neighbours in O(1). */
export function getActivities(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap('activities')
}
