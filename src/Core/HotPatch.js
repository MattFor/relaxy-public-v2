'use strict';
export const patchPrototype = (target, FreshClass) => {
    const liveProto = typeof target === 'function' ? target.prototype : Object.getPrototypeOf(target);
    const freshProto = FreshClass.prototype;

    for (const name of Object.getOwnPropertyNames(freshProto)) {
        if (name === 'constructor') {
            continue;
        }

        Object.defineProperty(liveProto, name, Object.getOwnPropertyDescriptor(freshProto, name));
    }

    for (const name of Object.getOwnPropertyNames(liveProto)) {
        if (name === 'constructor') {
            continue;
        }

        if (!Object.prototype.hasOwnProperty.call(freshProto, name)) {
            delete liveProto[name];
        }
    }

    const liveCtor = liveProto.constructor;
    if (typeof liveCtor === 'function') {
        const reserved = new Set(['length', 'name', 'prototype']);

        for (const name of Object.getOwnPropertyNames(FreshClass)) {
            if (reserved.has(name)) {
                continue;
            }

            try {
                Object.defineProperty(liveCtor, name, Object.getOwnPropertyDescriptor(FreshClass, name));
            } catch {}
        }
    }

    return liveProto;
};

export const extractConstructorSource = (src) => {
    if (typeof src !== 'string' || src.length === 0) {
        return '<<no-source>>';
    }

    const match = /\bconstructor\s*\(/.exec(src);
    if (!match) {
        return '<<no-constructor>>';
    }

    const start = match.index;

    let parenDepth = 0;
    let braceDepth = 0;
    let inBody = false;

    let stringDelim = null;
    let lineComment = false;
    let blockComment = false;

    for (let i = start; i < src.length; i++) {
        const ch = src[i];
        const next = src[i + 1];

        if (lineComment) {
            if (ch === '\n') {
                lineComment = false;
            }

            continue;
        }

        if (blockComment) {
            if (ch === '*' && next === '/') {
                blockComment = false;
                i++;
            }

            continue;
        }

        if (stringDelim) {
            if (ch === '\\') {
                i++;
            } else if (ch === stringDelim) {
                stringDelim = null;
            }

            continue;
        }

        if (ch === '/' && next === '/') {
            lineComment = true;
            i++;
            continue;
        }

        if (ch === '/' && next === '*') {
            blockComment = true;
            i++;
            continue;
        }

        if (ch === '"' || ch === "'" || ch === '`') {
            stringDelim = ch;
            continue;
        }

        if (!inBody) {
            if (ch === '(') {
                parenDepth++;
            } else if (ch === ')') {
                parenDepth--;
            } else if (ch === '{' && parenDepth === 0) {
                inBody = true;
                braceDepth = 1;
            }
        } else {
            if (ch === '{') {
                braceDepth++;
            } else if (ch === '}') {
                braceDepth--;

                if (braceDepth === 0) {
                    return src.slice(start, i + 1);
                }
            }
        }
    }

    return src.slice(start);
};
