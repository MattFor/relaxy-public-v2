import type * as Discord from "discord.js";
import type Relaxy from "relaxy";
import type {GuildDoc} from "./Database.js";

export type PermissionName = string;

export type CommandSlashBuilder =
    | Discord.SlashCommandBuilder
    | Discord.SlashCommandOptionsOnlyBuilder
    | Discord.SlashCommandSubcommandsOnlyBuilder
    | Omit<Discord.SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">;

export interface Command {
    name: string;
    aliases?: string[];
    usage: string;
    description: string;
    slashDescription?: string;
    slash?: CommandSlashBuilder;

    args?: boolean;
    cooldown?: number;

    owner?: boolean;
    nsfw?: boolean;
    leaveout?: boolean;
    undergoingchange?: boolean;
    howto?: string;

    permissionsUser?: PermissionName[];
    permissionsBot?: PermissionName[];
    suggestedPermissionsUser?: PermissionName[];
    suggestedPermissionsBot?: PermissionName[];

    run(
        client: Relaxy,
        message: Discord.Message,
        args: string[],
        guild: GuildDoc,
        interaction?: Discord.Interaction
    ): any | Promise<any>;
}

export default Command;
