import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { docNameForTrip, getActivities, getDays, getMeta, tripIdFromDocName } from './schema'

describe('trip document shape', () => {
  it('exposes meta, days, and activities on a fresh doc', () => {
    const doc = new Y.Doc()
    expect(getMeta(doc)).toBeInstanceOf(Y.Map)
    expect(getDays(doc)).toBeInstanceOf(Y.Array)
    expect(getActivities(doc)).toBeInstanceOf(Y.Map)
  })

  it('round-trips a document name through a trip id', () => {
    const tripId = '3f8c1e2a-0b4d-4c9e-8a71-2d5f6e7a8b90'
    expect(tripIdFromDocName(docNameForTrip(tripId))).toBe(tripId)
  })

  it('rejects a document name with the wrong prefix', () => {
    expect(() => tripIdFromDocName('note:123')).toThrow(/document name/i)
  })

  it('merges concurrent edits to different fields without loss', () => {
    const a = new Y.Doc()
    const b = new Y.Doc()

    getMeta(a).set('title', 'Tokyo')
    getMeta(b).set('destination', 'Japan')

    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b))

    expect(getMeta(a).get('title')).toBe('Tokyo')
    expect(getMeta(a).get('destination')).toBe('Japan')
    expect(getMeta(b).get('title')).toBe('Tokyo')
  })
})
