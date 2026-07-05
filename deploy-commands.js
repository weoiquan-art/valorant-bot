const { REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

// 定义我们要注册的斜杠指令
const commands = [
    new SlashCommandBuilder()
        .setName('valorant')
        .setDescription('发送 Valorant 组队匹配面板'),
        
    // 💡 这是新加的介绍指令！
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('查看 Valorant 机器人的全能使用指南！'),
].map(command => command.toJSON());

// 准备好与 Discord API 通信的工具
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// 开始向 Discord 注册指令
(async () => {
    try {
        console.log('正在开始注册斜杠指令...');

        // 这里我们把指令注册到指定的服务器（Guild），这样更新速度最快（秒更新）
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands },
        );

        console.log('🎉 成功！斜杠指令已成功注册到你的服务器！');
    } catch (error) {
        console.error('注册指令时发生错误:', error);
    }
})();