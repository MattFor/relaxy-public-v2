# Relaxy! (v1.0.0 - public source)

At long last, a partially redacted, read-only mirror of the Relaxy! Discord bot.  
Relaxy! is a sharded bot covering moderation, levelling, an economy, music, image generation, tickets, welcome cards and
cross-server role and moderation syncing, backed by MongoDB and built to run on hardware as small
as a Raspberry Pi.

The working source lives in a private repository. This copy exists so the code can be read. I'd like to be transparent with what I offer.

## What has been redacted

Every comment has been stripped from every source file. The comments in the private tree carry
the reasoning behind most of the decisions that look strange without it, so what remains here is
structure and logic with none of the history.

These are removed as well:

| Path                              | Reason                                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------------- |
| `bot/commands/administrator/`     | Owner tooling: console access, database export and transform, blacklist, raid simulation |
| `src/Client/Modules/MusicPlayer/` | The patched music pipeline                                                               |
| `.env`, `.env.example`            | Secrets and host paths                                                                   |
| `docs/`                           | Architecture and maintenance notes                                                       |
| `scripts/`                        | Deployment, migration and dependency tooling                                             |

## This code does not run!

With no configuration, no music player and no owner commands, it will not start. As per the [LICENSE](LICENSE) it's for
reading only, you cannot use any of this code, only study it.

## Contact

|         |                      |
| ------- | -------------------- |
| Email   | mattfor@relaxy.xyz   |
| Discord | `mattfor`            |
| Website | <https://relaxy.xyz> |

Feel free to message me, I'd be extremely happy to talk about this project!

## Built with

|          |                                                                                                                                         |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime  | Node.js v24.17.0+, ES6 modules                                                                                                          |
| Discord  | discord.js v14, `@discordjs/voice`, discord-api-types                                                                                   |
| Sharding | discord-hybrid-sharding, discord-cross-hosting for multi-machine fleets                                                                 |
| Database | MongoDB via mongoose                                                                                                                    |
| Audio    | discord-player v7 (custom), SoundCloud and YouTube extractors, discord-voip, ffmpeg-static, fluent-ffmpeg, sodium-native, opus bindings |
| Images   | canvas, canvacord, sharp, discord-image-generation, emoji-mixer                                                                         |
| Text     | natural, stopword, fuse.js, `@web-scrobbler/metadata-filter`, google-translate, tesseract-ocr out of process                            |
| Types    | TypeScript declarations over plain JavaScript, `checkJs` off                                                                            |
| Process  | bubblewrap sandbox, MongoDB-backed settings, `.env` for host paths and secrets                                                          |

## What it does

162 public commands across five categories, plus 58 Discord and music event handlers.

### Moderation

One shared implementation behind every action, so a ban placed by command, by the dashboard or by
a synced partner server lands identically: same case number, same modlog entry, same DM, same
appeal invite.

- **Cases** cover actions taken by hand in the Discord client as well as Relaxy's own, read from
  the audit log. A lift is recorded as an outcome on the case it lifts, not as a new case.
- **`=dossier`** assembles a member's whole file on one screen: standing, live ban beside its
  case, mute row, every name seen, cases from both sides, warnings with tiers, activity.
- **Warnings with tiers**, an autoban threshold, and a ladder that can mute, kick, ban or move
  roles at a given count, firing once on the crossing.
- **Censoring** with per-server word lists, a scam-domain feed, exemptions and channel limits.
- **Image scam detection**, OCR over screenshots whose text lives in pixels, deduplicated by
  image hash and shared across the fleet.
- **Raid protection**, lockdown, slowmode, purge, reaction purge, custom per-command permissions,
  exempt and elevated lists, batched modlogs, and a fleet-wide blacklist.

### Cross-server links

Two servers join when the same person runs the same command in both within thirty minutes. That
is the whole security model, and it means nothing can be linked unilaterally.

- **Ban appeals** in a partner server, since a banned member cannot post where they were banned.
  One private thread per ban, dossier included, staff only.
- **Role syncing** across a pool of servers, adopting existing roles rather than duplicating
  them, with differently named roles attachable to one group.
- **Synced moderation**, off by default, carrying an action to every consenting partner with each
  server's own case number.

### Levelling, economy and games

XP from messages and voice with anti-spam, per-server and global levels, rank cards and
leaderboards. Per-level rewards settle roles as a state, pay money only on the crossing, and can
back-fill a server that has been levelling for years. Daily rewards, a shop, inventory, trading,
reputation and a card collection. Snake, minesweeper, tic-tac-toe, counting with payouts, polls,
coinflip, dice and an eight ball.

### Music

A patched discord-player with YouTube and SoundCloud extractors, equalizer, filters, lyrics and a
prefetcher. A track that resolves but produces no stream is retried before anything is said to
the channel, and the volume stage always stays in the pipeline so volume remains settable.

### Server features

Welcome and goodbye cards rendered with canvas, heartboards with tiers and vote reconciliation,
ticket systems with modal forms, reaction roles and panels, autorole, autoname, forum management,
join-to-create voice channels, private channels, voice recording, reminders, redirects and
restrictions, image and meme commands, and the usual info commands.

### Operations

A manager console with live commands and per-cluster inspection. Hot reload that decides for
itself when a change genuinely needs a recluster. An ADSR watchdog that restarts a shard on
sustained errors, and a network watchdog that recognises a fleet-wide outage and holds off
respawning until it is over. A dashboard write API that routes each mutation to the cluster
owning the guild. A garbage collector reconciling stored ids against Discord, with a 180-day
grace before a departed guild's data is purged and 30 days for a departed member's.

---

By MattFor - 2026
