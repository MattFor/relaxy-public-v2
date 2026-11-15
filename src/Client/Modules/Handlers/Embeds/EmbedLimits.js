'use strict';
export const EMBED_LIMITS = {
    title: 256,
    description: 4096,
    fieldName: 256,
    fieldValue: 1024,
    footerText: 2048,
    authorName: 256,

    fields: 25,

    total: 6000,

    perMessage: 10
};

const len = (value) => (typeof value === 'string' ? value : String(value ?? '')).trim().length;

export const validateEmbed = (embed, label = 'The embed') => {
    const problems = [];

    if (!embed || typeof embed !== 'object') {
        return {
            ok: false,
            total: 0,
            problems: [`${label} is not a valid embed object.`]
        };
    }

    const check = (value, limit, what) => {
        const size = len(value);

        if (size > limit) {
            problems.push(
                `${what} is **${size}** characters, but Discord allows **${limit}** (over by ${size - limit}).`
            );
        }

        return size;
    };

    let total = 0;

    total += check(embed.title, EMBED_LIMITS.title, 'The **title**');
    total += check(embed.description, EMBED_LIMITS.description, 'The **description**');
    total += check(embed.footer?.text, EMBED_LIMITS.footerText, 'The **footer text**');
    total += check(embed.author?.name, EMBED_LIMITS.authorName, 'The **author name**');

    const fields = Array.isArray(embed.fields) ? embed.fields : [];

    if (fields.length > EMBED_LIMITS.fields) {
        problems.push(`There are **${fields.length}** fields, but Discord allows **${EMBED_LIMITS.fields}**.`);
    }

    fields.forEach((field, index) => {
        const nth = index + 1;

        total += check(field?.name, EMBED_LIMITS.fieldName, `Field **#${nth}**'s name`);
        total += check(field?.value, EMBED_LIMITS.fieldValue, `Field **#${nth}**'s value`);

        if (!len(field?.name)) {
            problems.push(
                `Field **#${nth}** has an empty name. Use a zero-width space (\`\\u200b\`) if you want it to look blank.`
            );
        }

        if (!len(field?.value)) {
            problems.push(
                `Field **#${nth}** has an empty value. Use a zero-width space (\`\\u200b\`) if you want it to look blank.`
            );
        }
    });

    if (total > EMBED_LIMITS.total) {
        problems.push(
            `All the text together is **${total}** characters, but Discord allows **${EMBED_LIMITS.total}** across one embed (over by ${total - EMBED_LIMITS.total}).` +
                ' This limit counts the title, description, every field name and value, the footer and the author name added together.'
        );
    }

    return {
        ok: !problems.length,
        total,
        problems
    };
};

const MAX_LISTED = 12;

export const describeViolations = (result) => {
    const listed = result.problems.slice(0, MAX_LISTED);
    const hidden = result.problems.length - listed.length;

    const lines = [
        "That embed is over Discord's limits, so it was not sent:",
        '',
        ...listed.map((problem) => `• ${problem}`)
    ];

    if (hidden > 0) {
        lines.push(`• …and **${hidden}** more problem${hidden === 1 ? '' : 's'}.`);
    }

    lines.push('', `_Running total: ${result.total}/${EMBED_LIMITS.total} characters._`);

    return lines.join('\n').slice(0, EMBED_LIMITS.description);
};
