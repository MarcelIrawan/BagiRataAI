import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  migrateV1,
  SCHEMA_VERSION,
  findPeriode,
  kontribusi,
  settlementRows,
  notaGrandTotal,
} from '../js/domain.js';

const CREATED = '2026-01-01T08:00:00.000Z';
const CLOSED = '2026-02-10T18:00:00.000Z';

function legacyStore() {
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
      {
        id: 'team2',
        name: 'Liburan',
        holderId: 'y',
        status: 'closed',
        createdAt: CREATED,
        closedAt: CLOSED,
        members: [
          { id: 'x', name: 'Xena' },
          { id: 'y', name: 'Yudi' },
        ],
        bills: [
          {
            id: 'b2',
            merchant: 'Hotel',
            createdAt: CREATED,
            items: [{ id: 'i2', name: 'Kamar', qty: 1, price: 200000, assignedTo: ['x', 'y'] }],
            tax: 0,
            service: 0,
            discount: 0,
          },
        ],
        deposits: [],
      },
    ],
  };
}

test('migrating a v1 store produces v2 with one Tim and exactly one Periode per old team', () => {
  const v2 = migrateV1(legacyStore());

  assert.equal(v2.version, SCHEMA_VERSION);
  assert.equal(v2.tims.length, 2);
  for (const tim of v2.tims) {
    assert.equal(tim.periods.length, 1, `${tim.name} must hold exactly one Periode`);
    assert.ok(['open', 'closed'].includes(tim.periods[0].status));
  }

  const kantor = v2.tims.find((t) => t.id === 'team1');
  assert.equal(kantor.name, 'Kantor');
  assert.equal(kantor.holderId, 'h');
  assert.equal(kantor.members.length, 2);
  assert.deepEqual(kantor.handovers, []);
  assert.equal(kantor.periods[0].status, 'open');
  assert.equal(kantor.periods[0].bills.length, 1);
  assert.equal(kantor.periods[0].deposits.length, 1);
  assert.equal(kantor.periods[0].deposits[0].amount, 10000);
});

test('the migrated participants include the Holder', () => {
  const v2 = migrateV1(legacyStore());

  for (const tim of v2.tims) {
    assert.ok(
      tim.periods[0].participants.includes(tim.holderId),
      `${tim.name}: the Holder must be a participant`
    );
  }
  // Holder is the second member of the closed team; inclusion must not depend on order.
  const liburan = v2.tims.find((t) => t.id === 'team2');
  assert.deepEqual(liburan.periods[0].participants, ['x', 'y']);
});

test('a v1 Nota with no paidBy becomes Holder-paid for its grand total', () => {
  const v2 = migrateV1(legacyStore());
  const kantor = v2.tims.find((t) => t.id === 'team1');
  const periode = kantor.periods[0];
  const nota = periode.bills[0];

  assert.equal(notaGrandTotal(nota), 33000);
  assert.deepEqual(nota.paidBy, [{ memberId: 'h', amount: 33000 }]);
  assert.equal(kontribusi(kantor, periode, 'h'), 33000);
  assert.equal(kontribusi(kantor, periode, 'a'), 10000, 'only the migrated Setoran');
});

test('a closed v1 team becomes a closed Periode with its close time and a snapshot', () => {
  const v2 = migrateV1(legacyStore());
  const liburan = v2.tims.find((t) => t.id === 'team2');
  const periode = liburan.periods[0];

  assert.equal(periode.status, 'closed');
  assert.equal(periode.closedAt, CLOSED);
  assert.equal(periode.snapshot.at, CLOSED);
  assert.ok(Array.isArray(periode.snapshot.rows));
  assert.equal(periode.snapshot.rows.length, 2);

  const xena = periode.snapshot.rows.find((r) => r.memberId === 'x');
  assert.equal(xena.saldoAwal, 0);
  assert.equal(xena.konsumsi, 100000);
  assert.equal(xena.saldo, 100000);

  const rendered = settlementRows(liburan, findPeriode(liburan, periode.id));
  assert.equal(rendered.length, 2);
  for (const row of rendered) assert.equal(row.source, 'snapshot');
});

test('migration is idempotent: running it twice, or on a v2 store, changes nothing', () => {
  const once = migrateV1(legacyStore());
  const twice = migrateV1(once);

  assert.deepEqual(twice, once, 'migrating a v2 store returns it unchanged');
  assert.deepEqual(migrateV1(once), migrateV1(twice));
});

test('activeTeamId is carried into activeTimId and its Periode becomes active', () => {
  const v2 = migrateV1(legacyStore());

  assert.equal(v2.activeTimId, 'team1');
  assert.equal(v2.activePeriodeId, v2.tims.find((t) => t.id === 'team1').periods[0].id);
});

test('an unknown activeTeamId migrates to no active Tim', () => {
  const store = legacyStore();
  store.activeTeamId = 'gone';
  const v2 = migrateV1(store);

  assert.equal(v2.activeTimId, null);
  assert.equal(v2.activePeriodeId, null);
  assert.equal(v2.tims.length, 2);
});

test('an empty or absent v1 store migrates to an empty v2 store', () => {
  assert.deepEqual(migrateV1({ version: 1, teams: [] }).tims, []);
  assert.deepEqual(migrateV1(null).tims, []);
  assert.equal(migrateV1(null).version, SCHEMA_VERSION);
});
