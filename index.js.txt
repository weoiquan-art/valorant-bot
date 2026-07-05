const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    EmbedBuilder, 
    PermissionFlagsBits, 
    ChannelType 
} = require('discord.js');
require('dotenv').config();

// 创建机器人实例，勾选需要的权限（Intents）
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// 存储内存中的 Valorant 队列列表（放玩家的 Discord ID）
let valorantQueue = [];

// 存储正在生效的语音频道列表，用来做30秒倒计时检测
const activeVoiceChannels = new Map();

client.once('ready', () => {
    console.log(`🚀 成功！机器人已登录为：${client.user.tag}`);
    
    // 启动一个定时器，每 10 秒检查一次是否有空语音频道需要删除
    setInterval(checkEmptyChannels, 10000);
});

// 1. 监听斜杠指令
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'valorant') {
        // 创建组队面板的嵌入(Embed)消息
        const embed = new EmbedBuilder()
            .setColor('#FF4655') // Valorant 经典的红色
            .setTitle('🎯 Valorant 5人组队队列')
            .setDescription('点击下方按钮加入或退出队列。满 5 人将自动创建专属加密语音房！')
            .addFields({ name: `当前队列人数 (${valorantQueue.length}/5)`, value: getQueueStatus() })
            .setTimestamp();

        // 创建两个按钮
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('join_queue')
                .setLabel('🎯 Join Valorant Queue')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('leave_queue')
                .setLabel('❌ Leave Queue')
                .setStyle(ButtonStyle.Danger)
        );

        await interaction.reply({ embeds: [embed], components: [row] });
    }
});

// 2. 监听按钮点击事件
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const userId = interaction.user.id;
    let changed = false;

    if (interaction.customId === 'join_queue') {
        // 如果玩家不在队列里，加入
        if (!valorantQueue.includes(userId)) {
            valorantQueue.push(userId);
            changed = true;
            await interaction.reply({ content: `✅ 你已成功加入队列！`, ephemeral: true });
        } else {
            await interaction.reply({ content: `⚠️ 你已经在队列中，请勿重复加入。`, ephemeral: true });
        }
    } else if (interaction.customId === 'leave_queue') {
        // 如果玩家在队列里，移除
        if (valorantQueue.includes(userId)) {
            valorantQueue = valorantQueue.filter(id => id !== userId);
            changed = true;
            await interaction.reply({ content: `❌ 你已退出队列。`, ephemeral: true });
        } else {
            await interaction.reply({ content: `⚠️ 你本来就没在队列里。`, ephemeral: true });
        }
    }

    // 如果队列人数有变动，更新公共面板
    if (changed) {
        const originalEmbed = interaction.message.embeds[0];
        const updatedEmbed = EmbedBuilder.from(originalEmbed)
            .setFields({ name: `当前队列人数 (${valorantQueue.length}/5)`, value: getQueueStatus() });

        await interaction.message.edit({ embeds: [updatedEmbed] });

        // 核心：检查是否满了 5 个人
        if (valorantQueue.length >= 5) {
            // 抽出前 5 个人组成一队
            const team = valorantQueue.splice(0, 5);
            
            // 再次更新面板，把这5个人移走后的队列人数更新
            const emptyEmbed = EmbedBuilder.from(updatedEmbed)
                .setFields({ name: `当前队列人数 (${valorantQueue.length}/5)`, value: getQueueStatus() });
            await interaction.message.edit({ embeds: [emptyEmbed] });

            // 触发创建专属语音房间
            await createTeamVoiceChannel(interaction.guild, team, interaction.channel);
        }
    }
});

// 辅助函数：把 ID 列表转换成 Discord 的 @艾特 格式
function getQueueStatus() {
    if (valorantQueue.length === 0) return '暂无玩家在队列中...';
    return valorantQueue.map(id => `<@${id}>`).join('\n');
}

// 核心函数：创建加密语音房间
async function createTeamVoiceChannel(guild, teamMembers, textChannel) {
    try {
        // 设置房间权限：@everyone 看不见也进不去
        const permissionOverwrites = [
            {
                id: guild.roles.everyone.id,
                deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
            }
        ];

        // 循环给匹配到的 5 个人单独开启“可见”和“进入”权限
        teamMembers.forEach(userId => {
            permissionOverwrites.push({
                id: userId,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
            });
        });

        // 在服务器里创建语音频道
        const count = activeVoiceChannels.size + 1;
        const voiceChannel = await guild.channels.create({
            name: `Valorant Room ${count} 🔒`,
            type: ChannelType.GuildVoice,
            userLimit: 5, // 人数上限 5 人
            permissionOverwrites: permissionOverwrites
        });

        // 把这个房间记录下来，标明它是有效房间，目前还没进入删除倒计时
        activeVoiceChannels.set(voiceChannel.id, {
            channel: voiceChannel,
            emptySince: null
        });

        // 在文字频道通知这 5 个人
        const dynamicMentions = teamMembers.map(id => `<@${id}>`).join(' ');
        await textChannel.send(`🎉 **匹配成功！** ${dynamicMentions}\n您的专属语音房间已创建：**${voiceChannel.name}**，请立即进入！`);

    } catch (error) {
        console.error('创建语音频道失败:', error);
    }
}

// 核心函数：定时检测无人空房间，30秒后自动删除
async function checkEmptyChannels() {
    const now = Date.now();

    for (const [channelId, data] of activeVoiceChannels.entries()) {
        try {
            // 重新获取频道最新状态
            const channel = await data.channel.fetch().catch(() => null);
            
            // 如果频道在 Discord 里已经被手动删了，直接从内存移除
            if (!channel) {
                activeVoiceChannels.delete(channelId);
                continue;
            }

            const memberCount = channel.members.size;

            if (memberCount === 0) {
                // 如果房间没人，且之前没有记录过空置时间，现在开始记录
                if (!data.emptySince) {
                    data.emptySince = now;
                } else if (now - data.emptySince >= 30000) {
                    // 如果空置时间已经超过 30 秒 (30000毫秒)，执行删除
                    await channel.delete();
                    activeVoiceChannels.delete(channelId);
                    console.log(`🗑️ 语音房 ${channel.name} 超过 30 秒没人，已自动删除。`);
                }
            } else {
                // 如果有人进去了，重置计时器
                data.emptySince = null;
            }
        } catch (error) {
            console.error('检查或删除房间时出错:', error);
        }
    }
}

// 登录机器人
client.login(process.env.DISCORD_TOKEN);
// 🎵 专门用来骗过 Render 端口检测的纯净小网页
require('http').createServer((req, res) => res.end('Bot is running!')).listen(process.env.PORT || 3000);