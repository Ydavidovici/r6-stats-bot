// Direct-Ubisoft provider (via r6api.js-next). Authenticates with a burner
// account and pulls stats straight from Ubisoft, so the rank/RP/record it
// returns has no third-party caching lag — the freshest data available.
//
// IMPORTANT: Ubisoft blocks this from datacenter/VPS IPs (DataDome). It only
// works from a residential IP (e.g. your self-hosted laptop) and a burner
// account with 2FA disabled. Enable with R6_PROVIDER=ubisoft.
//
// Ubisoft has no timestamped RP history and no rich operator/entry/clutch
// fields, so in hybrid mode (see ../client.js) it only serves accountInfo and
// playerStats; seasonal history, operators and ban status stay on r6data.
//
// Response normalization lives in ./ubisoft-adapt.js so it stays testable
// without importing the library.
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pkg = require("r6api.js-next");
import { adaptStats, adaptAccount, pickRankedBoard } from "./ubisoft-adapt.js";

const R6API = pkg.default || pkg;

let api = null;
function getApi() {
  if (!api) {
    const email = process.env.UBI_EMAIL;
    const password = process.env.UBI_PASSWORD;
    if (!email || !password) {
      throw new Error("UBI_EMAIL / UBI_PASSWORD must be set for R6_PROVIDER=ubisoft");
    }
    api = new R6API({ email, password });
  }
  return api;
}

async function resolveProfile(name, platformType) {
  const matches = await getApi().findUserByUsername({ platform: platformType, usernames: [name] });
  const p = Array.isArray(matches) ? matches[0] : matches;
  if (!p) throw new Error(`Ubisoft: no profile for "${name}" on ${platformType}`);
  return p;
}

const firstOf = (res) => (Array.isArray(res) ? res[0] : res);

export async function accountInfo(name, platformType) {
  const profile = await resolveProfile(name, platformType);
  const prog = firstOf(
    await getApi().getUserProgression({ platform: platformType, profileIds: [profile.profileId] })
  );
  return adaptAccount(profile, prog, name, platformType);
}

export async function playerStats(name, platformType /* platformFamilies, board */) {
  const profile = await resolveProfile(name, platformType);
  const seasonal = await getApi().getUserSeasonal({
    platform: platformType,
    profileIds: [profile.profileId],
  });
  return adaptStats(pickRankedBoard(seasonal));
}
