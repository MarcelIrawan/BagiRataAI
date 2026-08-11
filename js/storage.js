/** localStorage persistence for BagiRata team periods */
const STORAGE_KEY = 'bagirata.v1';

function defaultStore() {
  return { teams: [], activeTeamId: null };
}

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultStore();
    const parsed = JSON.parse(raw);
    return {
      teams: Array.isArray(parsed.teams) ? parsed.teams : [],
      activeTeamId: parsed.activeTeamId || null
    };
  } catch (e) {
    console.error('Failed to load bagirata store', e);
    return defaultStore();
  }
}

function saveStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function getTeam(store, teamId) {
  return (store.teams || []).find(t => t.id === teamId) || null;
}

function upsertTeam(store, team) {
  const idx = store.teams.findIndex(t => t.id === team.id);
  if (idx >= 0) store.teams[idx] = team;
  else store.teams.push(team);
  saveStore(store);
  return store;
}

function createTeamRecord({ name, members, holderId }) {
  return {
    id: uid('team'),
    name: name.trim(),
    status: 'open',
    holderId,
    members: members.map((m, i) => ({
      id: m.id || uid('m'),
      name: m.name,
      colorIndex: typeof m.colorIndex === 'number' ? m.colorIndex : i % FRIEND_COLORS.length
    })),
    bills: [],
    deposits: [],
    createdAt: new Date().toISOString(),
    closedAt: null
  };
}

function membersToFriends(members) {
  return (members || []).map(m => ({
    id: m.id,
    name: m.name,
    color: FRIEND_COLORS[m.colorIndex % FRIEND_COLORS.length]
  }));
}
