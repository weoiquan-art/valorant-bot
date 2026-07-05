const { 
    Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, 
    ButtonStyle, EmbedBuilder, PermissionFlagsBits, ChannelType 
} = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates
    ]
});

let valorantQueue = [];
const activeVoiceChannels = new Map();

client.once('ready', () => {
    console.log(`🚀 成功！机器人已登录为：${client.user.tag}`);
    setInterval(checkEmptyChannels, 10000);
});

client.on('interactionCreate', async (interaction) => {
    // 1. 处理斜杠指令
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'valorant') {
            const embed = new EmbedBuilder()
                .setColor('#FF4655')
                .setTitle('🎯 Valorant 5人组队队列')
                .setDescription('点击下方按钮加入或退出队列。满 5 人将自动创建专属加密语音房！')
                .addFields({ name: `当前队列人数 (${valorantQueue.length}/5)`, value: getQueueStatus() })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('join_queue').setLabel('🎯 Join Queue').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('leave_queue').setLabel('❌ Leave Queue').setStyle(ButtonStyle.Danger)
            );
            await interaction.reply({ embeds: [embed], components: [row] });

        } else if (interaction.commandName === 'help') {
            await interaction.reply({ 
                content: '🤖 **Valorant 助手指南**\n使用 `/valorant` 开启组队，点击按钮加入。满 5 人后我会自动创建加密语音房，30秒无人使用会自动删除！', 
                ephemeral: true 
            });
        }
    } 
    // 2. 处理按钮交互
    else if (interaction.isButton()) {
        const userId = interaction.user.id;
        let changed = false;

        if (interaction.customId === 'join_queue') {
            if (!valorantQueue.includes(userId)) {
                valorantQueue.push(userId);
                changed = true;
                await interaction.reply({ content: `✅ 加入成功！`, ephemeral: true });
            } else {
                await interaction.reply({ content: `⚠️ 你已经在队列里了。`, ephemeral: true });
            }
        } else if (interaction.customId === 'leave_queue') {
            if (valorantQueue.includes(userId)) {
                valorantQueue = valorantQueue.filter(id => id !== userId);
                changed = true;
                await interaction.reply({ content: `❌ 已退出队列。`, ephemeral: true });
            } else {
                await interaction.reply({ content: `⚠️ 你不在队列里。`, ephemeral: true });
            }
        }

        if (changed) {
            const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                .setFields({ name: `当前队列人数 (${valorantQueue.length}/5)`, value: getQueueStatus() });
            await interaction.message.edit({ embeds: [updatedEmbed] });

            if (valorantQueue.length >= 5) {
                const team = valorantQueue.splice(0, 5);
                await createTeamVoiceChannel(interaction.guild, team, interaction.channel);
                
                const finalEmbed = EmbedBuilder.from(updatedEmbed)
                    .setFields({ name: `当前队列人数 (${valorantQueue.length}/5)`, value: getQueueStatus() });
                await interaction.message.edit({ embeds: [finalEmbed] });
            }
        }
    }
});

function getQueueStatus() {
    return valorantQueue.length === 0 ? '暂无玩家...' : valorantQueue.map(id => `<@${id}>`).join('\n');
}

async function createTeamVoiceChannel(guild, teamMembers, textChannel) {
    try {
        const permissionOverwrites = [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] }];
        teamMembers.forEach(id => permissionOverwrites.push({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] }));

        const voiceChannel = await guild.channels.create({
            name: `Valorant Room 🔒`,
            type: ChannelType.GuildVoice,
            userLimit: 5,
            permissionOverwrites
        });

        activeVoiceChannels.set(voiceChannel.id, { channel: voiceChannel, emptySince: null });
        await textChannel.send(`🎉 匹配成功！${teamMembers.map(id => `<@${id}>`).join(' ')}\n房间已创建：**${voiceChannel.name}**`);
    } catch (e) { console.error(e); }
}

async function checkEmptyChannels() {
    for (const [id, data] of activeVoiceChannels.entries()) {
        const channel = await data.channel.fetch().catch(() => null);
        if (!channel) { activeVoiceChannels.delete(id); continue; }
        if (channel.members.size === 0) {
            if (!data.emptySince) data.emptySince = Date.now();
            else if (Date.now() - data.emptySince >= 30000) { await channel.delete(); activeVoiceChannels.delete(id); }
        } else data.emptySince = null;
    }
}

client.login(process.env.DISCORD_TOKEN);
require('http').createServer((req, res) => res.end('Bot is running!')).listen(process.env.PORT || 3000);