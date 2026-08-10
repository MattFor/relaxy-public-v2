'use strict';
const bump = async (client, guildId, userId, field) =>
{
    const member = await client.module.database.Member(userId, guildId).catch(() => null);

    if (!member)
    {
        return;
    }

    client.saveMember(guildId, userId, {
        alter: field,
        value: (member[field] ?? 0) + 1
    });
};

export const creditReaction = async (client, reaction, user) =>
{
    const guildId = reaction.message?.guild?.id;

    if (!guildId || user?.bot)
    {
        return;
    }

    await bump(client, guildId, user.id, 'rx');

    let message = reaction.message;

    if (message.partial)
    {
        message = await message.fetch().catch(() => null);

        if (!message)
        {
            return;
        }
    }

    const author = message.author;

    if (!author || author.bot)
    {
        return;
    }

    await bump(client, guildId, author.id, 'rr');
};
