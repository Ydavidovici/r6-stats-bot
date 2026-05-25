// Adds the standard player-target options (username / platform / user) shared by
// the lookup commands.
export function addTargetOptions(builder) {
  return builder
    .addStringOption((o) =>
      o.setName("username").setDescription("R6 username (omit to use your linked account)")
    )
    .addStringOption((o) =>
      o
        .setName("platform")
        .setDescription("Platform")
        .addChoices(
          { name: "PC (Ubisoft)", value: "uplay" },
          { name: "PlayStation", value: "psn" },
          { name: "Xbox", value: "xbl" }
        )
    )
    .addUserOption((o) =>
      o.setName("user").setDescription("Use another Discord user's linked account")
    );
}

export const PLATFORM_CHOICES = [
  { name: "PC (Ubisoft)", value: "uplay" },
  { name: "PlayStation", value: "psn" },
  { name: "Xbox", value: "xbl" },
];
