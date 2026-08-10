'use strict';
export const version = 4;

export const schemas = {
    server: {
        collection:  'servers',
        identifiers: ['id'],
        openMaps:    [
            'cmd.cp',
            'cmd.gr',
            'd.cs'
        ],
        upgrades:    [],
        defaults:    {
            id: '',
            px: ['='],
            dm: -1,
            lk: false,

            ps: 0,

            as:  0,
            reg: [],
            d:   {
                vt:  0,
                msg: 0,
                cg:  0,
                ca:  0,
                cs:  {},
                mut: {
                    id: '',
                    n:  0
                }
            },
            cmd: {
                dis: [],
                cp:  {},
                gr:  {}
            },
            mbr: {
                ex: [],
                el: []
            },
            ch:  {
                t: {
                    cl: [],
                    rs: []
                },
                v: { pv: [] }
            },
            cn:  {
                on: false,
                ab: 0,
                li: [],
                rn: false,
                dt: 5 * 60 * 1000,
                c:  '',
                ex: []
            },
            lv:  {
                on: false,
                t:  0,
                c:  ''
            },
            co:  {
                on:   false,
                c:    '',
                cur:  0,
                hi:   0,
                last: '',
                rst:  true,
                pay:  0
            }
        }
    },

    guildConfig: {
        collection:  'guildconfig',
        identifiers: ['g'],
        openMaps:    [
            'tk.sy',
            'ml.ev',
            'tr.w',
            'tr.l',
            'rt.1',
            'rt.2',
            'rt.3',
            'rt.4'
        ],
        upgrades:    [
            {

                from:  2,
                apply: document =>
                       {
                           if (typeof document?.ap?.tr === 'string')
                           {
                               document.ap.tr = document.ap.tr
                                   ? [document.ap.tr]
                                   : [];
                           }

                           return document;
                       }
            }
        ],
        defaults:    {
            g:   '',
            an:  '',
            ach: {
                c:  '',
                on: false,
                n:  0
            },
            rec: {
                on: false,
                n:  0
            },
            rl:  {
                a: [],
                x: []
            },
            wc:  {
                on: false,
                t:  0,
                j:  {
                    t: 'Welcome!',
                    b: 'Glad to see you here!',
                    m: 'Hi |U|, welcome to |G|!',
                    c: ''
                },
                l:  {
                    t: 'Goodbye!',
                    b: 'Farewell friend!',
                    m: 'Bye bye |U|, hope you\'ve had a great time here!',
                    c: ''
                }
            },
            dg:  {
                on: false,
                j:  '',
                l:  ''
            },
            cb:  {
                on:  false,
                del: false,
                b:   {
                    c:  '',
                    dt: ''
                },
                l1:  {
                    c:  '',
                    dt: ''
                },
                l2:  {
                    c:  '',
                    dt: ''
                },
                l3:  {
                    c:  '',
                    dt: ''
                }
            },
            bm:  {
                on: false,
                dt: ''
            },
            hb:  {
                on: false,
                cs: []
            },
            fo:  {
                on: false,
                cs: []
            },
            tk:  {
                on: false,
                sy: {}
            },

            ap: {
                on:  false,
                p:   '',
                c:   '',
                h:   [],
                tr:  [],
                rq:  '',
                rqu: '',
                rqt: 0
            },

            sr: {
                on:  false,
                gs:  [],
                r:   [],
                ma:  false,
                rq:  '',
                rqu: '',
                rqt: 0
            },

            bnm: {
                on: false,
                dt: ''
            },

            pn: 0,
            rd: {
                on: false,
                bn: false,
                tr: false,
                th: 25,
                tp: 300_000,
                al: 2_678_400_000
            },

            ml: {
                on: false,
                ls: false,
                ev: {}
            },
            tr: {
                w: {},
                l: {}
            },
            rt: {
                1: {},
                2: {},
                3: {},
                4: {}
            },
            mo: {
                le: false,
                ls: false,
                iv: 10,
                bt: 300
            }
        }
    },

    member: {
        collection:  'members',
        identifiers: [
            'id',
            'g'
        ],

        openMaps: ['ap'],
        upgrades: [
            {

                from:  3,
                apply: document =>
                       {
                           if (typeof document.ap === 'string')
                           {
                               document.ap = {};
                           }

                           return document;
                       }
            },
            {

                from:  1,
                apply: document =>
                       {
                           delete document.dm;

                           return document;
                       }
            }
        ],
        defaults: {
            id:  '',
            g:   '',
            rc:  '',
            m:   0,
            inv: [],
            xp:  0,
            msg: 0,
            cmd: 0,
            lvl: 0,
            lc:  '',
            co:  0,
            vc:  0,
            rx:  0,
            rr:  0,
            nh:  [],
            lm:  0,
            ap:  {}
        }
    },

    profile: {
        collection:  'profiles',
        identifiers: ['id'],
        openMaps:    [],
        upgrades:    [],
        defaults:    {
            id:  '',
            m:   0,
            ra:  0,
            la:  '',
            rc:  '',
            ach: {
                playedtrack:    false,
                playedplaylist: false,
                setwelcome:     false,
                saved:          false,
                fetched:        false,
                madepoll:       false,
                got_heart:      false,
                madeheartboard: false,
                lockeddown:     false,
                image:          false,
                lvldup:         false
            },
            inv: [],
            xp:  0,
            msg: 0,
            cmd: 0,
            rep: [],
            lvl: 0,
            to:  false,
            lo:  false,
            dm:  true,
            rm:  [],
            lp:  {
                t:  '',
                g:  '',
                at: 0
            },
            lm:  0,
            dc:  0,
            ds:  0
        }
    },

    warning: {
        collection:  'warnings',
        identifiers: [
            'g',
            'u'
        ],
        openMaps:    [],
        upgrades:    [],
        defaults:    {
            g: '',
            u: '',
            w: []
        }
    },

    mute: {
        collection:  'mutes',
        identifiers: [
            'g',
            'u'
        ],
        openMaps:    [],
        upgrades:    [],
        defaults:    {
            g:  '',
            u:  '',
            md: -1,
            ex: 0,
            rl: [],
            rs: -1,
            du: 0,
            c:  -1,
            at: 0,
            bn: false
        }
    },

    reactionRole: {
        collection:  'reactionroles',
        identifiers: ['g'],
        openMaps:    [],
        upgrades:    [],
        defaults:    {
            g: '',
            e: []
        }
    },

    forumChannel: {
        collection:  'forumchannels',
        identifiers: [
            'id',
            'g'
        ],
        openMaps:    [],
        upgrades:    [],
        defaults:    {
            id: '',
            g:  '',
            em: '',
            rl: [],
            tg: {
                p: '',
                a: ''
            },
            ck: {
                mt: [],
                tl: 0,
                bl: 0,
                ac: 0,
                rw: false,
                sp: false,
                cn: false,
                og: false
            },

            rp: {
                ac: '',
                rj: '',
                sp: 'Sorry |U|, **|T|** has been rejected for being spam.',
                tl: 'Sorry |U|, **|T|** has been rejected: its title is |L| characters, which is |D| {overCase/underCase} the |M| this forum allows.',
                bl: 'Sorry |U|, **|T|** has been rejected: it is |L| characters long, which is |D| {overCase/underCase} the |M| this forum allows.',
                at: 'Sorry |U|, **|T|** has been rejected for having too {overCase/underCase} attachments: it has |L|, and this forum allows |M|.',
                cn: '|U|, **|T|** has been rejected for containing words that are censored by Relaxy!'
            },
            st: {
                hd: false,
                pr: false,
                ap: false,
                to: 0,
                sn: {
                    on: false,
                    c:  ''
                }
            }
        }
    },

    heartBoard: {
        collection:  'heartboards',
        identifiers: [
            'id',
            'g'
        ],
        openMaps:    [],
        upgrades:    [],
        defaults:    {
            id: '',
            g:  '',
            rq: 3,
            co: 16738740,
            em: [
                '❤️',
                '💓',
                '💖',
                '💞',
                '💗'
            ],
            nm: 1,
            pc: '',
            pm: ''
        }
    },

    heartBoardPost: {
        collection:  'heartboardposts',
        identifiers: ['oid'],
        openMaps:    [],
        upgrades:    [],
        defaults:    {
            oid: '',
            eid: '',
            g:   '',
            oc:  '',
            or:  [],
            er:  [],
            n:   0
        }
    },

    ticketSystem: {
        collection:  'ticketsystems',
        identifiers: [
            'g',
            'c',
            'mid'
        ],
        openMaps:    [
            'fm',
            'bt',
            'en'
        ],
        upgrades:    [],
        defaults:    {
            mid: '',
            g:   '',
            c:   '',
            ds:  '',
            fm:  {},
            bt:  {},
            en:  {}
        }
    },

    reminder: {
        collection:  'reminders',
        identifiers: [
            'u',
            'sa'
        ],
        openMaps:    [],
        upgrades:    [],
        defaults:    {
            u:  '',
            nt: '',
            sa: 0,
            ea: 0,
            du: 0
        }
    },

    case: {
        collection:  'cases',
        identifiers: [
            'g',
            'n'
        ],
        openMaps:    [],
        upgrades:    [],
        defaults:    {
            g:  '',
            n:  0,
            ty: '',
            u:  '',
            md: '',
            rs: '',
            ex: '',
            at: 0,
            ou: []
        }
    },

    stat: {
        collection:  'stats',
        identifiers: [
            'g',
            'd'
        ],
        openMaps:    [],
        upgrades:    [],
        defaults:    {
            g:  '',
            d:  0,
            m:  0,
            c:  0,
            vc: 0,
            j:  0,
            l:  0
        }
    }
};
export const indexes = {
    servers:         [
        {
            key:     { id: 1 },
            options: { unique: true }
        }
    ],
    guildconfig:     [
        {
            key:     { g: 1 },
            options: { unique: true }
        }
    ],
    warnings:        [
        {
            key:     {
                g: 1,
                u: 1
            },
            options: { unique: true }
        },
        {
            key:     { g: 1 },
            options: {}
        }
    ],
    mutes:           [
        {
            key:     {
                g: 1,
                u: 1
            },
            options: { unique: true }
        },
        {
            key:     { ex: 1 },
            options: {}
        }
    ],
    members:         [
        {
            key:     {
                g:  1,
                id: 1
            },
            options: { unique: true }
        },
        {
            key:     {
                g:  1,
                xp: -1
            },
            options: {}
        },
        {
            key:     {
                g:   1,
                msg: -1
            },
            options: {}
        },
        {
            key:     {
                g:  1,
                vc: -1
            },
            options: {}
        },
        {
            key:     {
                g:  1,
                rx: -1
            },
            options: {}
        },

        {
            key:     { lm: 1 },
            options: {}
        },

        {
            key:     { id: 1 },
            options: {}
        },

        {
            key:     {
                g:      1,
                'nh.n': 1
            },
            options: {}
        }
    ],
    profiles:        [
        {
            key:     { id: 1 },
            options: { unique: true }
        },
        {
            key:     { lm: 1 },
            options: {}
        }
    ],
    heartboardposts: [
        {
            key:     { oid: 1 },
            options: {}
        },
        {
            key:     { eid: 1 },
            options: {}
        },
        {
            key:     { g: 1 },
            options: {}
        }
    ],
    forumchannels:   [
        {
            key:     {
                g:  1,
                id: 1
            },
            options: {}
        }
    ],
    heartboards:     [
        {
            key:     {
                g:  1,
                id: 1
            },
            options: {}
        }
    ],
    ticketsystems:   [
        {
            key:     {
                g:   1,
                c:   1,
                mid: 1
            },
            options: {}
        }
    ],
    reminders:       [
        {
            key:     { u: 1 },
            options: {}
        },
        {
            key:     { ea: 1 },
            options: {}
        }
    ],
    reactionroles:   [
        {
            key:     { g: 1 },
            options: { unique: true }
        }
    ],

    stats: [
        {
            key:     {
                g: 1,
                d: -1
            },
            options: { unique: true }
        }
    ],
    cases: [
        {
            key:     {
                g: 1,
                n: 1
            },
            options: { unique: true }
        },
        {
            key:     {
                g: 1,
                u: 1
            },
            options: {}
        },

        {
            key:     {
                g:  1,
                md: 1
            },
            options: {}
        },
        {
            key:     { g: 1 },
            options: {}
        }
    ]
};
export const modelToSchema = {
    Server:         'server',
    GuildConfig:    'guildConfig',
    Member:         'member',
    Profile:        'profile',
    Warning:        'warning',
    Mute:           'mute',
    ForumChannel:   'forumChannel',
    HeartBoard:     'heartBoard',
    HeartBoardPost: 'heartBoardPost',
    TicketSystem:   'ticketSystem',
    ReactionRole:   'reactionRole',
    Reminder:       'reminder',
    Case:           'case',
    Stat:           'stat'
};

export default {
    version,
    schemas,
    indexes,
    modelToSchema
};
