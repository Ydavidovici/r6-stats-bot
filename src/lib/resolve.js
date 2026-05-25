import { getLink } from "../db/repo.js";

const familiesFor = (platformType) => (platformType === "uplay" ? "pc" : "console");

// Resolve which R6 account a command targets, from (in priority order):
//   1. an explicit `username` (+ optional `platform`) option
//   2. a mentioned `user` option's linked account
//   3. the invoking user's own linked account
// Returns { nameOnPlatform, platformType, platformFamilies } or { error }.
export function resolveTarget(interaction) {
  const username = interaction.options.getString("username");
  const platform = interaction.options.getString("platform");

  if (username) {
    const platformType = platform || "uplay";
    return { nameOnPlatform: username, platformType, platformFamilies: familiesFor(platformType) };
  }

  const mentioned = interaction.options.getUser?.("user");
  const targetUser = mentioned || interaction.user;
  const link = getLink(targetUser.id);
  if (!link) {
    return {
      error: mentioned
        ? `**${targetUser.username}** hasn't linked an R6 account yet.`
        : "You haven't linked an R6 account. Use `/link` first, or pass a `username`.",
    };
  }
  return {
    nameOnPlatform: link.name_on_platform,
    platformType: link.platform_type,
    platformFamilies: link.platform_families,
  };
}
