import type {Snowflake} from "./Database.js";

export type MessageTypeName =
    | "MISSING_TYPE"
    | "CUSTOM_REQUEST"
    | "CUSTOM_MESSAGE"
    | "CUSTOM_REPLY"
    | "HEARTBEAT"
    | "HEARTBEAT_ACK"
    | "CLIENT_BROADCAST_REQUEST"
    | "CLIENT_BROADCAST_RESPONSE"
    | "CLIENT_RESPAWN"
    | "CLIENT_RESPAWN_ALL"
    | "CLIENT_MAINTENANCE"
    | "CLIENT_MAINTENANCE_ENABLE"
    | "CLIENT_MAINTENANCE_DISABLE"
    | "CLIENT_MAINTENANCE_ALL"
    | "CLIENT_SPAWN_NEXT_CLUSTER"
    | "CLIENT_READY"
    | "CLIENT_EVAL_REQUEST"
    | "CLIENT_EVAL_RESPONSE"
    | "CLIENT_MANAGER_EVAL_REQUEST"
    | "CLIENT_MANAGER_EVAL_RESPONSE"
    | "MANAGER_BROADCAST_REQUEST"
    | "MANAGER_BROADCAST_RESPONSE"
    | "CLIENT_AUTORESHARDER_SENDDATA"
    | "CLIENT_TOGGLE"
    | "CLIENT_UPDATE"
    | "CLIENT_SET"
    | "CLIENT_SHOW"
    | "CLIENT_RESPONSE"
    | "CLIENT_REQUEST"
    | "CLIENT_CREATE"
    | "CLIENT_DELETE"
    | "CLIENT_PROCESS_SPAWNED"
    | "MANAGER_RECLUSTER_START"
    | "MANAGER_RECLUSTER_IN_PROGRESS"
    | "MANAGER_RECLUSTER_FINISHED"
    | "MANAGER_RECLUSTER_ACK"
    | "CLIENT_COMMAND_CHANGE"
    | "CLIENT_EVENT_CHANGE"
    | "CLIENT_CORE_CHANGED"
    | "MANAGER_REQUEST"
    | "MANAGER_DELIVER";

export type MessageTypeTable =
    & Record<MessageTypeName, number>
    & Record<number, MessageTypeName>;

export interface IPCMessage<T = unknown> {
    _type: number;
    variant?: string;
    data?: T;
}

export interface OperatingMode {
    SPECIAL: -1;
    NORMAL: 0;
    DEBUG: 1;
    MAINTENANCE: 2;
    SILENT: 3;
    OFFLINE: 4;
}

export interface LogChannelDefinition {
    description: string;
    side: "both" | "client" | "manager";
}

export type LogChannelName =
    | "debug"
    | "heartbeats"
    | "inter_process_messages"
    | "file_operations"
    | "garbage_collector"
    | "cpu_monitor"
    | "cpu_monitor_file_logs"
    | "music_debug"
    | "raw_events"
    | "event_names"
    | "rate_limiter"
    | "message_debug"
    | "database"
    | "swallowed"
    | "ratelimits"
    | "statistics";

export type LogChannels = Record<LogChannelName, LogChannelDefinition>;

export type LogMasterChannel = "debug";
export type ModlogEvent =
    | "other"
    | "warning"
    | "memberMuted"
    | "memberUnmuted"
    | "channelUpdate"
    | "channelCreate"
    | "channelDelete"
    | "emojiCreate"
    | "emojiDelete"
    | "emojiUpdate"
    | "guildBanAdd"
    | "guildBanRemove"
    | "guildMemberAdd"
    | "guildMemberRemove"
    | "guildMemberUpdate"
    | "inviteCreate"
    | "inviteDelete"
    | "messageDelete"
    | "messageUpdate"
    | "roleCreate"
    | "roleDelete"
    | "roleUpdate"
    | "voiceStateUpdate"
    | "messageDeleteBulk"
    | "stickerCreate"
    | "stickerDelete"
    | "stickerUpdate"
    | "threadCreate"
    | "threadDelete"
    | "threadUpdate"
    | "channelPinsUpdate"
    | "guildUpdate"
    | "guildScheduledEventCreate"
    | "guildScheduledEventDelete"
    | "guildScheduledEventUpdate"
    | "stageInstanceCreate"
    | "stageInstanceDelete"
    | "stageInstanceUpdate"
    | "webhooksUpdate"
    | "autoModerationRuleCreate"
    | "autoModerationRuleDelete"
    | "autoModerationRuleUpdate"
    | "autoModerationActionExecution";
export type CaseType =
    | "ban"
    | "tempban"
    | "kick"
    | "mute"
    | "timeout"
    | "untimeout"
    | "warn-ban"
    | "censor-ban";

export interface CaseTypeDefinition {
    label: string;
    emoji: string;
}

export type TierAction = "mute" | "kick" | "ban" | "role+" | "role-";

export interface TierActionDefinition {
    label: string;
    emoji: string;
    needsRole: boolean;
    takesDuration: boolean;
}

export interface WarningTierRule {
    n: number;
    a: TierAction;
    d?: number;
    r?: string;
}

export type AnyTier = "any";

export type LevelAction = "role+" | "role-" | "money" | "command";

export interface LevelActionDefinition {
    label: string;
    emoji: string;
    needsRole: boolean;
    state: boolean;
}

export interface LevelRule {
    a: LevelAction;
    r?: string;
    m?: number;
    c?: string;
}

export type PresenceStatusName = "online" | "idle" | "dnd" | "offline";

export interface LinkProposal {
    t: string;
    g: Snowflake;
    at: number;
}
