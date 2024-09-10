import { LabelerServer } from '@skyware/labeler';
import { Bot, Post } from '@skyware/bot';
import 'dotenv/config';
import { LabelType } from './type.js';
import {tags} from './tags.js';


const allTags = Object
  .values(tags)
  .map((tag) => tag.values.reduce((acc, val: any) => acc.concat(val.slug), []))
  .reduce((acc, val) => acc.concat(val), [])

console.log("All tags: " + allTags);

const server = new LabelerServer({
  did: process.env.LABELER_DID!,
  signingKey: process.env.SIGNING_KEY!,
});

server.start(4001, (error) => {
  if (error) {
    console.error('Failed to start server:', error);
  } else {
    console.log('Labeler server running on port 14831');
  }
});


const bot = new Bot();
await bot.login({
  identifier: process.env.LABELER_DID!,
  password: process.env.LABELER_PASSWORD!,
});

const availableLabels = new Map<string, LabelType>();

server.db.prepare('SELECT * FROM labels_definitions').all().forEach((row: any) => availableLabels.set(row.uri as string, row as LabelType));


bot.on('like', async ({ subject, user }) => {
  console.log(user.handle + `(${user.did})` + ' liked ' + subject.uri);

  if (!(subject instanceof Post)) {
    console.log(' -> [x] Subject is not a post');
    return;
  }

  const label = availableLabels.get(subject.uri);
  if (!label) {
    console.log(' -> [x] Post isn\'t related to any label');
    return;
  }

  if (label.delete_trigger) {
    console.log(' -> [v] Clearing ' + user.handle + ' labels');
    let userLabels = server.db.prepare('SELECT * FROM labels WHERE uri = ?').all(user.did);
    console.log(" -> [v] Negating " + userLabels.map((label: any) => label.val));

    let response = await server.createLabels({ uri: user.did }, { negate: [...allTags, 'clear'] });
    console.log(" -> [v] Response: " + response);
    
    server.db.prepare('DELETE FROM labels WHERE uri = ?').run(user.did);
    return;
  }

  console.log(' -> [v] Labeling ' + user.handle + ' with ' + label.name);
  await user.labelAccount([label.slug]);
});

