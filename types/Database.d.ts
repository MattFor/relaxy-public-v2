export type RegistryRef = number;

export type Snowflake = string;

export interface ServerCounters {
    vt: number;
    msg: number;
    cg: number;
    ca: number;
    cs: Record<string, number>;
    mut: {
        id: Snowflake;
        n: number;
    };
}

export interface ServerCensor {
    on: boolean;
    ab: number;
    li: string[];
    rn: boolean;
    dt: number;
    c: Snowflake;
}

export interface ServerDoc {
    id: Snowflake;
    v: number;
    reg: string[];
    px: string[];
    dm: number;
    lk: boolean;
    d: ServerCounters;
    cmd: {
        dis: string[];
        cp: Record<string, unknown>;
    };
    mbr: {
        ex: Snowflake[];
        el: Snowflake[];
    };
    ch: {
        t: {
            cl: Snowflake[];
            rs: Snowflake[];
        };
        v: {
            pv: Snowflake[];
        };
    };
    cn: ServerCensor;
    lv: {
        on: boolean;
        t: number;
        c: Snowflake;
    };
}

export interface ConfigGreeting {
    t: string;
    b: string;
    m: string;
    c: Snowflake;
}

export interface GuildConfigDoc {
    g: Snowflake;
    v: number;
    an: string;
    ach: {
        c: Snowflake;
        on: boolean;
        n: number;
    };
    rec: { on: boolean; n: number };
    rl: {
        a: Snowflake[];
    };
    wc: {
        on: boolean;
        t: number;
        j: ConfigGreeting;
        l: ConfigGreeting;
    };
    dg: { on: boolean; j: string; l: string };
    cb: {
        on: boolean;
        del: boolean;
        b: { c: Snowflake; dt: string };
        l1: { c: Snowflake; dt: string };
        l2: { c: Snowflake; dt: string };
        l3: { c: Snowflake; dt: string };
    };
    bm: { on: boolean; dt: string };
    hb: { on: boolean; cs: Snowflake[] };
    fo: { on: boolean; cs: Snowflake[] };
    tk: {
        on: boolean;
        sy: Record<string, unknown>;
    };
    rd: {
        on: boolean;
        bn: boolean;
        tr: boolean;
        th: number;
        tp: number;
        al: number;
    };
    ml: {
        on: boolean;
        ls: boolean;
        c: Snowflake;
        ev: Record<string, { on: boolean; channel: Snowflake; e?: unknown[] }>;
    };
    tr: {
        w: Record<string, unknown>;
        l: Record<string, unknown>;
    };
    rt: {
        '1': Record<string, unknown>;
        '2': Record<string, unknown>;
        '3': Record<string, unknown>;
        '4': Record<string, unknown>;
    };
    mo: {
        le: boolean;
        ls: boolean;
        iv: number;
        bt: number;
    };
}

export type GuildDoc = ServerDoc & Omit<GuildConfigDoc, 'g' | 'v'>;

export interface MemberDoc {
    id: Snowflake;
    g: Snowflake;
    v: number;
    rc: string;
    m: number;
    inv: unknown[];
    xp: number;
    msg: number;
    cmd: number;
    lvl: number;
    dm: boolean;
    lc: Snowflake;
    nh: Array<{
        n: string;
        k: 'u' | 'd' | 'n';
        t: number;
    }>;
}

export interface ProfileDoc {
    id: Snowflake;
    v: number;
    m: number;
    ra: number;
    la: string;
    rc: string;
    ach: Record<string, boolean>;
    inv: unknown[];
    xp: number;
    msg: number;
    cmd: number;
    rep: unknown[];
    lvl: number;
    to: boolean;
    lo: boolean;
    dm: boolean;
    rm: string[];
}

export interface WarningEntry {
    r: RegistryRef;
    t: number;
    a: RegistryRef;
    d: number;
    e: unknown[];
}

export interface WarningDoc {
    g: Snowflake;
    u: Snowflake;
    v: number;
    w: WarningEntry[];
}

export interface MuteDoc {
    g: Snowflake;
    u: Snowflake;
    v: number;
    md: RegistryRef;
    ex: number;
    rl: RegistryRef[];
    rs: RegistryRef;
    du: number;
    c: RegistryRef;
    at: number;
    bn: boolean;
}

export interface ReactionRoleDoc {
    g: Snowflake;
    v: number;
    e: unknown[];
}

export interface CaseDoc {
    g: Snowflake;
    n: number;
    v: number;
    ty: string;
    u: Snowflake;
    md: Snowflake;
    rs: string;
    ex: string;
    at: number;
}

export interface ForumChannelDoc {
    id: Snowflake;
    g: Snowflake;
    v: number;
    em: string;
    rl: Snowflake[];
    tg: {
        p: Snowflake;
        a: Snowflake;
    };
    ck: {
        mt: string[];
        tl: number;
        bl: number;
        ac: number;
        rw: boolean;
        sp: boolean;
        cn: boolean;
        og: boolean;
    };
    rp: {
        ac: string;
        rj: string;
        sp: string;
        tl: string;
        bl: string;
        at: string;
        cn: string;
    };
    st: {
        hd: boolean;
        pr: boolean;
        ap: boolean;
        to: number;
        sn: { on: boolean; c: Snowflake };
    };
}

export interface HeartBoardDoc {
    id: Snowflake;
    g: Snowflake;
    v: number;
    rq: number;
    co: number;
    em: string[];
    nm: number;
}

export interface HeartBoardPostDoc {
    oid: Snowflake;
    eid: Snowflake;
    g: Snowflake;
    oc: Snowflake;
    or: Snowflake[];
    er: Snowflake[];
    n: number;
    v: number;
}

export interface TicketSystemDoc {
    mid: Snowflake;
    g: Snowflake;
    c: Snowflake;
    v: number;
    ds: string;
    fm: Record<string, unknown>;
    bt: Record<string, unknown>;
    en: Record<string, unknown>;
}

export interface ReminderDoc {
    u: Snowflake;
    v: number;
    nt: string;
    sa: number;
    ea: number;
    du: number;
}

export interface StatDoc {
    g: Snowflake;
    v: number;
    d: number;
    m: number;
    c: number;
    vc: number;
    j: number;
    l: number;
}

export interface HostDoc {
    _id: string;
    hostname: string;
    shards: number[];
    clusters: number;
    guilds: number;
    users: number;
    players: number;
    cpuCount: number;
    cpuLoad: number;
    memUsed: number;
    memTotal: number;
    uptime: number;
    version: string;
    bridged: boolean;
    lastSeen: number;
    createdAt?: Date;
    updatedAt?: Date;
}

export interface BlacklistEntry {
    id: Snowflake;
    k: string;
    at: number;
    by: Snowflake;
    rs: string;
    ex: number;
}

export interface SettingsDoc {
    _id: string;
    version?: string;
    wmStatus?: string;
    clientStatus?: string;
    ownerIds: Snowflake[];
    youtubeCookie?: string;
    operatingMode?: number;
    requestNumber: number;
    blacklist: BlacklistEntry[];
    createdAt?: Date;
    updatedAt?: Date;
}
