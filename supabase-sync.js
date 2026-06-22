// Supabase sync for EFL League website
// Uses a separate table from the tournament website, so both can exist in the same Supabase project.

const SUPABASE_URL = "https://gcxlwxqqpiopverfznyn.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_ZpAOR-NpGMXnAUJwfe6P3A_mQb-sjj4";

const TABLE_NAME = "efl_league_data";

const keyMap = {
  league_settings: "settings",
  league_teams: "teams",
  league_matches: "matches"
};

const reverseKeyMap = {
  settings: "league_settings",
  teams: "league_teams",
  matches: "league_matches"
};

let applyingRemoteUpdate = false;
let supabaseClient = null;

function isConfigured() {
  return (
    SUPABASE_URL &&
    SUPABASE_ANON_KEY &&
    !SUPABASE_URL.includes("PASTE_YOUR") &&
    !SUPABASE_ANON_KEY.includes("PASTE_YOUR")
  );
}

function safeParse(value) {
  try {
    return JSON.parse(value || "null");
  } catch {
    return null;
  }
}

function getCurrentSiteData() {
  if (typeof window.data === "function") return window.data();

  return {
    settings: safeParse(localStorage.getItem("league_settings")),
    teams: safeParse(localStorage.getItem("league_teams")),
    matches: safeParse(localStorage.getItem("league_matches"))
  };
}

function saveLocal(remoteData) {
  if (!remoteData) return;
  applyingRemoteUpdate = true;
  Object.entries(reverseKeyMap).forEach(([remoteKey, localStorageKey]) => {
    if (remoteData[remoteKey] !== undefined && remoteData[remoteKey] !== null) {
      localStorage.setItem(localStorageKey, JSON.stringify(remoteData[remoteKey]));
    }
  });
  applyingRemoteUpdate = false;
}

function rerender() {
  if (typeof window.rerenderCurrentPage === "function") window.rerenderCurrentPage();
}

function setStatus(status, error = null) {
  window.dispatchEvent(new CustomEvent("supabase-league-status", { detail: { status, error } }));
}

async function upsertRows(rows) {
  if (!rows || rows.length === 0) return;
  const withTimestamp = rows.map((row) => ({ ...row, updated_at: new Date().toISOString() }));
  const { error } = await supabaseClient.from(TABLE_NAME).upsert(withTimestamp, { onConflict: "key" });
  if (error) throw error;
}

async function loadFromSupabase() {
  const { data, error } = await supabaseClient
    .from(TABLE_NAME)
    .select("key,value")
    .in("key", ["settings", "teams", "matches"]);

  if (error) throw error;

  const remoteData = {};
  (data || []).forEach((row) => {
    remoteData[row.key] = row.value;
  });

  const siteData = getCurrentSiteData();
  const missingRows = [];

  ["settings", "teams", "matches"].forEach((key) => {
    if (remoteData[key] === undefined || remoteData[key] === null) {
      remoteData[key] = siteData[key];
      if (siteData[key] !== undefined && siteData[key] !== null) missingRows.push({ key, value: siteData[key] });
    }
  });

  if (missingRows.length > 0) await upsertRows(missingRows);

  saveLocal(remoteData);
  rerender();
}

window.leagueSync = {
  async saveKey(localStorageKey, value) {
    if (applyingRemoteUpdate) return;
    if (!supabaseClient) return;

    const remoteKey = keyMap[localStorageKey];
    if (!remoteKey) return;

    try {
      await upsertRows([{ key: remoteKey, value }]);
      setStatus("saved");
    } catch (error) {
      console.error("Supabase save failed:", error);
      setStatus("save-failed", error);
    }
  }
};

// Backward-compatible alias.
window.firebaseEFL = window.leagueSync;

async function startSupabaseSync() {
  if (!isConfigured()) {
    console.warn("Supabase is not configured.");
    setStatus("not-configured");
    return;
  }

  if (!window.supabase || !window.supabase.createClient) {
    console.error("Supabase CDN did not load.");
    setStatus("cdn-failed");
    return;
  }

  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  window.supabaseLeagueClient = supabaseClient;

  try {
    await loadFromSupabase();
    setStatus("connected");
  } catch (error) {
    console.error("Supabase load failed:", error);
    setStatus("load-failed", error);
  }

  supabaseClient
    .channel("efl_league_data_realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: TABLE_NAME }, async () => {
      try {
        await loadFromSupabase();
        setStatus("connected");
      } catch (error) {
        console.error("Supabase realtime reload failed:", error);
        setStatus("realtime-reload-failed", error);
      }
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") setStatus("realtime-connected");
    });
}

startSupabaseSync();
