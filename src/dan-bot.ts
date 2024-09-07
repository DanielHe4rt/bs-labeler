import { Bot } from "@skyware/bot";
import 'dotenv/config'

const bot = new Bot();
await bot.login({
  identifier: process.env.LABELER_DID,
  password: process.env.LABELER_PASSWORD,
});

const post = await bot.post({ text: "Like the replies to this post to receive labels.", threadgate: { allowLists: [] } });

const backend = await post.reply({ text: "Back-end!" });
const frontend = await post.reply({ text: "Front-end!"});

console.log(
  `Back-end: ${backend.uri}\n`,
  `Front-end: ${frontend.uri}\n`,
);

