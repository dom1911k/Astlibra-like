import { describe, expect, it } from 'vitest';
import { ROOM_LIST } from '../src/data/rooms';
import { unreachableMarkers } from '../src/meta/reach';
import { Room } from '../src/sim/room';

describe('room templates', () => {
  for (const t of ROOM_LIST) {
    it(`${t.id}: every marker reachable from spawn without double jump`, () => {
      const room = new Room(t);
      expect(unreachableMarkers(room)).toEqual([]);
      if (t.kind !== 'hub' && t.kind !== 'arena') expect(room.exits.length).toBeGreaterThan(0);
    });
  }
});
