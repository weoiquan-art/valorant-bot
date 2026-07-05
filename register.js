const { REST, Routes } = require('discord.js');
require('dotenv').config();

const commands = [
  {
    name: 'valorant',
    description: '打开组队面板',
  },
  {
    name: 'help',
    description: '查看帮助指南',
  },
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('正在注册指令...');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('指令注册成功！');
  } catch (error) {
    console.error(error);
  }
})();