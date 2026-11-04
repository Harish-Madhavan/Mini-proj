import { describe, expect, it } from 'vitest';
import { buildInvestigationTimeline, filterTimeline } from './timelineEvents';

describe('investigation timeline', () => {
  it('collects dated case events and keeps undated graph labels out', () => {
    const timeline = buildInvestigationTimeline({
      links: [
        { source: 'a', target: 'b', timestamp: 'On-chain' },
        { source: 'a', target: 'b', txid: 'tx-1', timestamp: '2025-01-01T00:00:00Z' }
      ],
      notesList: [{ id: 'note-1', content: 'Preserve source record', timestamp: '2025-02-01T00:00:00Z' }],
      evidenceClaims: [{ id: 'claim-1', classification: 'Attribution hypothesis', statement: 'Possible service', createdAt: '2025-03-01T00:00:00Z' }],
      evidenceClaimReviews: {
        'claim-1': { status: 'reviewed', reviewerNote: 'Needs corroboration', reviewedAt: '2025-04-01T00:00:00Z' }
      },
      recoveryLeads: [{
        id: 'lead-1',
        actions: [{
          id: 'action-1',
          type: 'Prepare preservation request',
          state: 'preparing',
          createdAt: '2025-05-01T00:00:00Z',
          history: [{ event: 'details_updated', timestamp: '2025-06-01T00:00:00Z' }]
        }]
      }]
    });

    expect(timeline.map(entry => entry.kind)).toEqual([
      'Recovery action update',
      'Recovery action',
      'Evidence review',
      'Evidence claim',
      'Case note',
      'Trace flow'
    ]);
    expect(timeline.some(entry => entry.timestamp === 'On-chain')).toBe(false);
    expect(filterTimeline(timeline, { kind: 'Evidence review', query: 'corroboration' })).toHaveLength(1);
    expect(filterTimeline(timeline, { query: 'missing' })).toEqual([]);
  });

  it('returns an empty timeline for absent case data and sorts undated items last', () => {
    expect(buildInvestigationTimeline(null)).toEqual([]);
    expect(buildInvestigationTimeline({
      notesList: [
        { id: 'undated', content: 'Unknown time' },
        { id: 'dated', content: 'Known time', timestamp: '2025-01-01T00:00:00Z' }
      ]
    }).map(entry => entry.id)).toEqual(['dated', 'undated']);
  });
});
