import { LabelerServer } from "@skyware/labeler";
import {Bot, Post} from "@skyware/bot";
import 'dotenv/config'

const server = new LabelerServer({
  did: process.env.LABELER_DID,
  signingKey: process.env.SIGNING_KEY
});

server.start(4001, (error) => {
  if (error) {
    console.error("Failed to start server:", error);
  } else {
    console.log("Labeler server running on port 14831");
  }
});

const bot = new Bot();
await bot.login({
  identifier: process.env.LABELER_DID,
  password: process.env.LABELER_PASSWORD,
});

const postsToLabels: Record<string, string> = {
  "at://did:plc:doqrpcaai4iqmkbdo3ztmlld/app.bsky.feed.post/3l3lqns7dqy2m": "backend",
  "at://did:plc:doqrpcaai4iqmkbdo3ztmlld/app.bsky.feed.post/3l3lqnsfxhu2n": "frontend",
}

bot.on("like", async ({ subject, user }) => {
  console.log(user.handle + " liked " + subject.uri);
  if (subject instanceof Post) {
    const label = postsToLabels[subject.uri];
    console.log(label)
    if (label) {
      console.log("Labeling " + user.handle + " with " + label);
      let fodase = await server.createLabel({
        uri: user.did,
        val: label,
      });
      
      console.log(fodase)
    }
  }
});

