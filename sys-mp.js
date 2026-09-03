// ======================================================
// sys-mp.js — Core Engine Monopoli (Full Rules & Auction System)
// ======================================================

const MP_GROUP_COLORS = {
  brown: "#8b4513", lightblue: "#87ceeb", pink: "#ff69b4",
  orange: "#ffa500", red: "#ff0000", yellow: "#ffd700",
  green: "#008000", darkblue: "#00008b"
};

const MP_BOARD_DATA = [
  { id: 0, name: "START", short: "GO", type: "start", price: 0 },
  { id: 1, name: "Jakarta", short: "JKT", type: "property", price: 60, rent: 10, group: "brown", housePrice: 50 },
  { id: 2, name: "Dana Umum", short: "CHEST", type: "chest", price: 0 },
  { id: 3, name: "Bandung", short: "BDG", type: "property", price: 60, rent: 12, group: "brown", housePrice: 50 },
  { id: 4, name: "Pajak Penghasilan", short: "PAJAK", type: "tax", price: 200 },
  { id: 5, name: "Stasiun Gambir", short: "GMBR", type: "station", price: 200, rent: 25 },
  { id: 6, name: "Surabaya", short: "SBY", type: "property", price: 100, rent: 14, group: "lightblue", housePrice: 50 },
  { id: 7, name: "Kesempatan", short: "CHNC", type: "chance", price: 0 },
  { id: 8, name: "Semarang", short: "SMG", type: "property", price: 100, rent: 16, group: "lightblue", housePrice: 50 },
  { id: 9, name: "Yogyakarta", short: "JOG", type: "property", price: 120, rent: 18, group: "lightblue", housePrice: 50 },
  { id: 10, name: "PENJARA", short: "JAIL", type: "jail", price: 0 },
  { id: 11, name: "Denpasar", short: "DPS", type: "property", price: 140, rent: 20, group: "pink", housePrice: 100 },
  { id: 12, name: "Perusahaan Listrik", short: "PLN", type: "utility", price: 150 },
  { id: 13, name: "Kuta", short: "KTA", type: "property", price: 140, rent: 22, group: "pink", housePrice: 100 },
  { id: 14, name: "Ubud", short: "UBD", type: "property", price: 160, rent: 24, group: "pink", housePrice: 100 },
  { id: 15, name: "Stasiun Pasar Senen", short: "SNEN", type: "station", price: 200, rent: 25 },
  { id: 16, name: "Medan", short: "MDN", type: "property", price: 180, rent: 26, group: "orange", housePrice: 100 },
  { id: 17, name: "Dana Umum", short: "CHEST", type: "chest", price: 0 },
  { id: 18, name: "Palembang", short: "PLB", type: "property", price: 180, rent: 28, group: "orange", housePrice: 100 },
  { id: 19, name: "Padang", short: "PDG", type: "property", price: 200, rent: 30, group: "orange", housePrice: 100 },
  { id: 20, name: "PARKIR GRATIS", short: "FREE", type: "parking", price: 0 },
  { id: 21, name: "Makassar", short: "MKS", type: "property", price: 220, rent: 32, group: "red", housePrice: 150 },
  { id: 22, name: "Kesempatan", short: "CHNC", type: "chance", price: 0 },
  { id: 23, name: "Manado", short: "MND", type: "property", price: 220, rent: 34, group: "red", housePrice: 150 },
  { id: 24, name: "Balikpapan", short: "BKP", type: "property", price: 240, rent: 36, group: "red", housePrice: 150 },
  { id: 25, name: "Stasiun Tugu", short: "TUGU", type: "station", price: 200, rent: 25 },
  { id: 26, name: "Pontianak", short: "PTK", type: "property", price: 260, rent: 38, group: "yellow", housePrice: 150 },
  { id: 27, name: "Banjarmasin", short: "BJM", type: "property", price: 260, rent: 40, group: "yellow", housePrice: 150 },
  { id: 28, name: "Perusahaan Air", short: "PAM", type: "utility", price: 150 },
  { id: 29, name: "Samarinda", short: "SMD", type: "property", price: 280, rent: 42, group: "yellow", housePrice: 150 },
  { id: 30, name: "MASUK PENJARA", short: "GOTO", type: "goto_jail", price: 0 },
  { id: 31, name: "Malang", short: "MLG", type: "property", price: 300, rent: 44, group: "green", housePrice: 200 },
  { id: 32, name: "Solo", short: "SLO", type: "property", price: 300, rent: 46, group: "green", housePrice: 200 },
  { id: 33, name: "Dana Umum", short: "CHEST", type: "chest", price: 0 },
  { id: 34, name: "Bogor", short: "BGR", type: "property", price: 320, rent: 48, group: "green", housePrice: 200 },
  { id: 35, name: "Stasiun Hall", short: "HALL", type: "station", price: 200, rent: 25 },
  { id: 36, name: "Kesempatan", short: "CHNC", type: "chance", price: 0 },
  { id: 37, name: "Ibu Kota Nusantara", short: "IKN", type: "property", price: 350, rent: 60, group: "darkblue", housePrice: 200 },
  { id: 38, name: "Pajak Mewah", short: "PAJAK", type: "tax", price: 100 },
  { id: 39, name: "Raja Ampat", short: "R4", type: "property", price: 400, rent: 80, group: "darkblue", housePrice: 200 }
];

const MP_PLAYER_COLORS = {
  p1: "#e4574f", p2: "#3d6bf0", p3: "#2bb673",
  p4: "#e8ac1f", p5: "#9b59b6", p6: "#e67e22"
};

const CHANCE_CARDS = [
  { text: "Mendapat hadiah festival! +$100", amount: 100 },
  { text: "Kena tilang lalu lintas! -$50", amount: -50 },
  { text: "Maju ke START! +$200", goto: 0, collectStart: true },
  { text: "Kartu Bebas Penjara Gratis!", getOutJail: true },
  { text: "Masuk Penjara!", gotoJail: true }
];

const CHEST_CARDS = [
  { text: "Klaim dividen investasi! +$150", amount: 150 },
  { text: "Bayar asuransi kesehatan! -$100", amount: -100 },
  { text: "Hadiah Ulang Tahun! +$50", amount: 50 },
  { text: "Kartu Bebas Penjara Gratis!", getOutJail: true },
  { text: "Pengeluaran tak terduga! -$75", amount: -75 }
];

function getMpRoles(maxPlayers) {
  return ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].slice(0, maxPlayers);
}

function nextMpTurn(game) {
  const roles = getMpRoles(game.maxPlayers);
  let curIdx = roles.indexOf(game.turn);
  let nextIdx = (curIdx + 1) % roles.length;
  let count = 0;

  const bankruptList = game.bankrupt || [];
  while (bankruptList.includes(roles[nextIdx]) && count < roles.length) {
    nextIdx = (nextIdx + 1) % roles.length;
    count++;
  }
  return roles[nextIdx];
}

function buildNewMpGame(maxPlayers) {
  const roles = getMpRoles(maxPlayers);
  let money = {}, pos = {}, inJail = {}, jailCards = {};

  roles.forEach(r => {
    money[r] = 1500;
    pos[r] = 0;
    inJail[r] = 0;
    jailCards[r] = 0;
  });

  return {
    phase: 'playing',
    maxPlayers: maxPlayers,
    turn: 'p1',
    dice: [1, 1],
    doubleStreak: 0,
    hasRolled: false,
    money: money,
    pos: pos,
    inJail: inJail,
    jailCards: jailCards,
    ownership: {},
    mortgaged: {},
    houses: {},
    auction: null,
    bankrupt: [],
    lastTurnTime: Date.now(),
    lastActionText: 'Game Monopoli Dimulai! p1 silakan lempar dadu.'
  };
}

function calculateRent(state, tile, owner, diceTotal = 7) {
  if (state.mortgaged && state.mortgaged[tile.id]) {
    return 0;
  }

  if (tile.type === 'utility') {
    let utilCount = 0;
    MP_BOARD_DATA.forEach(t => {
      if (t.type === 'utility' && state.ownership[t.id] === owner && (!state.mortgaged || !state.mortgaged[t.id])) utilCount++;
    });
    return utilCount >= 2 ? diceTotal * 10 : diceTotal * 4;
  }

  if (tile.type === 'station') {
    let stationCount = 0;
    MP_BOARD_DATA.forEach(t => {
      if (t.type === 'station' && state.ownership[t.id] === owner && (!state.mortgaged || !state.mortgaged[t.id])) stationCount++;
    });
    return (tile.rent || 25) * Math.pow(2, stationCount - 1);
  }

  if (tile.type === 'property') {
    const houseCount = (state.houses && state.houses[tile.id]) || 0;
    if (houseCount > 0) {
      return Math.floor(tile.rent * Math.pow(2.5, houseCount));
    }
    if (tile.group) {
      const groupTiles = MP_BOARD_DATA.filter(t => t.group === tile.group);
      const ownsAll = groupTiles.every(t => state.ownership[t.id] === owner && (!state.mortgaged || !state.mortgaged[t.id]));
      return ownsAll ? tile.rent * 2 : tile.rent;
    }
  }

  return tile.rent || 20;
}

function ownsFullGroup(state, owner, group) {
  if (!group) return false;
  const groupTiles = MP_BOARD_DATA.filter(t => t.group === group);
  return groupTiles.every(t => state.ownership[t.id] === owner);
}

function handleBankruptcy(state, role, creditorRole = null) {
  state.bankrupt = state.bankrupt || [];
  if (!state.bankrupt.includes(role)) {
    state.bankrupt.push(role);
  }

  const remainingCash = Math.max(0, state.money[role] || 0);
  state.money[role] = 0;

  if (state.ownership) {
    Object.keys(state.ownership).forEach(tileId => {
      if (state.ownership[tileId] === role) {
        if (creditorRole) {
          state.ownership[tileId] = creditorRole;
        } else {
          delete state.ownership[tileId];
        }
        if (state.houses) delete state.houses[tileId];
        if (state.mortgaged) delete state.mortgaged[tileId];
      }
    });
  }

  if (creditorRole) {
    state.money[creditorRole] = (state.money[creditorRole] || 0) + remainingCash;
  }

  if (state.turn === role) {
    state.turn = nextMpTurn(state);
    state.hasRolled = false;
    state.doubleStreak = 0;
  }

  const allRoles = getMpRoles(state.maxPlayers);
  const activeRoles = allRoles.filter(r => !state.bankrupt.includes(r));
  if (activeRoles.length === 1) {
    state.phase = 'gameover';
    state.winner = activeRoles[0];
    state.lastActionText = `🏆 GAME OVER! ${activeRoles[0].toUpperCase()} Menang Sebagai Juara Monopoli!`;
  }
}
