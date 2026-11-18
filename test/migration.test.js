import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  migrateV2,
  SCHEMA_VERSION,
  kontribusi,
  settlementRows,
  notaGrandTotal,
  saldoNow,
} from '../public/js/domain.js';

const CREATED = '2026-01-01T08:00:00.000Z';
const CLOSED = '2026-02-10T18:00:00.000Z';

function legacyStore() {
  return {
    version: 2,
    activeTimId: 'team1',
    tims: [
      {
        id: 'team1',
        name: 'Kantor',
        holderId: 'h',
        status: 'open',
        createdAt: CREATED,
        closedAt: null,
        members: [
          { id: 'h', name: 'Hana', colorIndex: 0 },
          { id: 'a', name: 'Andi', colorIndex: 1 },
        ],
        periods: [
          {
            id: 'p1',
            label: 'Oktober',
            status: 'open',
            openedAt: CREATED,
            closedAt: null,
            participants: ['h', 'a'],
            bills: [
              {
                id: 'b1',
                merchant: 'Warung',
                createdAt: CREATED,
                items: [{ id: 'i1', name: 'Nasi', qty: 1, price: 30000, assignedTo: ['a'] }],
                tax: 3000,
                service: 0,
                discount: 0,
                paidBy: [],
              },
            ],
            deposits: [{ id: 'd1', memberId: 'a', amount: 10000, createdAt: CREATED }],
            saldoAwalByMember: {},
            snapshot: null,
            reDerivedAt: null,
          },
        ],
        handovers: [],
        archivedAt: null,
      },
      {
        id: 'team2',
        name: 'Liburan',
        holderId: 'y',
        status: 'closed',
        createdAt: CREATED,
        closedAt: CLOSED,
        members: [
          { id: 'x', name: 'Xena', colorIndex: 0 },
          { id: 'y', name: 'Yudi', colorIndex: 1 },
        ],
        periods: [
          {
            id: 'p1',
            label: 'Januari',
            status: 'closed',
            openedAt: CREATED,
            closedAt: CLOSED,
            participants: ['x', 'y'],
            bills: [
              {
                id: 'b2',
                merchant: 'Hotel',
                createdAt: CREATED,
                items: [{ id: 'i2', name: 'Kamar', qty: 1, price: 200000, assignedTo: ['x', 'y'] }],
                tax: 0,
                service: 0,
                discount: 0,
                paidBy: [],
              },
            ],
            deposits: [],
            saldoAwalByMember: {},
            snapshot: { at: CLOSED, rows: [], kas: 0 },
            reDerivedAt: null,
          },
        ],
        handovers: [],
        archivedAt: null,
      },
    ],
  };
}

function v1Store() {
  return {
    version: 1,
    activeTeamId: 'team1',
    teams: [
      {
        id: 'team1',
        name: 'Kantor',
        holderId: 'h',
        status: 'open',
        createdAt: CREATED,
        closedAt: null,
        members: [
          { id: 'h', name: 'Hana' },
          { id: 'a', name: 'Andi' },
        ],
        bills: [
          {
            id: 'b1',
            merchant: 'Warung',
            createdAt: CREATED,
            items: [{ id: 'i1', name: 'Nasi', qty: 1, price: 30000, assignedTo: ['a'] }],
            tax: 3000,
            service: 0,
            discount: 0,
          },
        ],
        deposits: [{ id: 'd1', memberId: 'a', amount: 10000, createdAt: CREATED }],
      },
    ],
  };
}

test('migrating a v2 store (with periods) produces v3 with flattened Tim', () => {
  const v3 = migrateV2(legacyStore());

  assert.equal(v3.version, SCHEMA_VERSION);
  assert.equal(v3.tims.length, 2);
  for (const tim of v3.tims) {
    assert.ok(!tim.periods, 'Tim should not have periods anymore');
    assert.ok(Array.isArray(tim.notes));
    assert.ok(Array.isArray(tim.setorans));
    assert.ok(tim.openingBalances);
  }

  const kantor = v3.tims.find((t) => t.id === 'team1');
  assert.equal(kantor.name, 'Kantor');
  assert.equal(kantor.holderId, 'h');
  assert.equal(kantor.members.length, 2);
  assert.equal(kantor.notes.length, 1);
  assert.equal(kantor.setorans.length, 1);
  assert.equal(kantor.setorans[0].amount, 10000);
});

test('migrating a v1 store produces v3 with flattened Tim', () => {
  const v3 = migrateV2(v1Store());

  assert.equal(v3.version, SCHEMA_VERSION);
  assert.equal(v3.tims.length, 1);
  const kantor = v3.tims[0];
  assert.equal(kantor.name, 'Kantor');
  assert.equal(kantor.holderId, 'h');
  assert.equal(kantor.members.length, 2);
  assert.equal(kantor.notes.length, 1);
  assert.equal(kantor.setorans.length, 1);
  assert.equal(kantor.setorans[0].amount, 10000);
});

test('a v1/v2 Nota with no paidBy becomes Holder-paid for its grand total', () => {
  const v3 = migrateV2(legacyStore());
  const kantor = v3.tims.find((t) => t.id === 'team1');
  const nota = kantor.notes[0];

  assert.equal(notaGrandTotal(nota), 33000);
  assert.deepEqual(nota.paidBy, [{ memberId: 'h', amount: 33000 }]);
  assert.equal(kontribusi(kantor, 'h'), 33000);
  assert.equal(kontribusi(kantor, 'a'), 10000, 'only the migrated Setoran');
});

test('migration is idempotent: running it twice, or on a v3 store, changes nothing', () => {
  const once = migrateV2(legacyStore());
  const twice = migrateV2(once);

  assert.deepEqual(twice, once, 'migrating a v3 store returns it unchanged');
  assert.deepEqual(migrateV2(once), migrateV2(twice));
});

test('activeTimId is carried into activeTimId', () => {
  const v3 = migrateV2(legacyStore());

  assert.equal(v3.activeTimId, 'team1');
});

test('an unknown activeTimId migrates to no active Tim', () => {
  const store = legacyStore();
  store.activeTimId = 'gone';
  const v3 = migrateV2(store);

  assert.equal(v3.activeTimId, null);
  assert.equal(v3.tims.length, 2);
});

test('an empty or absent v2/v1 store migrates to an empty v3 store', () => {
  assert.deepEqual(migrateV2({ version: 2, tims: [] }).tims, []);
  assert.deepEqual(migrateV2(null).tims, []);
  assert.equal(migrateV2(null).version, SCHEMA_VERSION);
});

test('v2 closed period with snapshot becomes Tim with notes and setorans (no snapshot)', () => {
  const v3 = migrateV2(legacyStore());
  const liburan = v3.tims.find((t) => t.id === 'team2');

  assert.equal(liburan.notes.length, 1);
  assert.equal(liburan.setorans.length, 0);
  assert.deepEqual(liburan.openingBalances, {});
});

test('saldoNow works correctly after migration', () => {
  const v3 = migrateV2(legacyStore());
  const kantor = v3.tims.find((t) => t.id === 'team1');
  // Andi: konsumsi 33000 - setoran 10000 = 23000
  assert.equal(saldoNow(kantor, 'a'), 23000);
  // Hana: paid 33000 - konsumsi 0 = -33000
  assert.equal(saldoNow(kantor, 'h'), -33000);
});
