import { LabelerServer } from '@skyware/labeler';
import { AtpAgent, ComAtprotoLabelDefs } from '@atproto/api';
import { tags } from './tags.js';
import 'dotenv/config';
import { setLabelerLabelDefinitions } from '@skyware/labeler/scripts';



const server = new LabelerServer({
  did: process.env.LABELER_DID!,
  signingKey: process.env.SIGNING_KEY!,
});

const prepareDatabase = async (server: LabelerServer) => {// 
  server.db.prepare('DROP TABLE IF EXISTS labels_definitions;').run();
  server.db.prepare(
    'CREATE TABLE IF NOT EXISTS labels_definitions (name TEXT, slug TEXT PRIMARY KEY, description TEXT, uri TEXT, delete_trigger BOOLEAN);',
  ).run();

  

  const agent = new AtpAgent({
    service: 'https://bsky.social',
  });

  const loginCredentials = {
    identifier: process.env.DID!,
    password: process.env.BSKY_PASSWORD!,
  };

  await agent.login(loginCredentials);
  
  const labelDefinitions: ComAtprotoLabelDefs.LabelValueDefinition[] = [];

  for (const [_id, { description, values }] of Object.entries(tags)) {
    console.log("category: " + description);

    let categoryPost = await agent.post({
      text: description,
      createdAt: new Date().toISOString(),
    });
    
    
    if (description == tags.clearAll.description) {
      server.db.prepare('INSERT INTO labels_definitions (name, slug, description, uri, delete_trigger) VALUES (?, ?, ?, ?, ?);').run(description, 'clear', description, categoryPost.uri, 1);
      break
    }
    
    let parent = {
      uri: categoryPost.uri,
      cid: categoryPost.cid,
    };

    for (const tag of values) {
      let post = await agent.post({
        text: tag.name + ' -> ' + tag.description,
        createdAt: new Date().toISOString(),
        reply: {
          root: {
            uri: categoryPost.uri,
            cid: categoryPost.cid,
          },
          parent: parent,
        },
      });
      console.log(" -> tag: " + tag.name);

      server.db.prepare('INSERT INTO labels_definitions (name, slug, description, uri, delete_trigger) VALUES (?, ?, ?, ?, ?);').run(tag.name, tag.slug, tag.description, post.uri, 0);

      const labelValueDefinition: ComAtprotoLabelDefs.LabelValueDefinition = {
        identifier: tag.slug,
        severity: 'inform',
        blurs: 'none',
        defaultSetting: 'warn',
        adultOnly: false,
        locales: [
          {
            lang: 'en',
            name: tag.name,
            description: tag.description,
          },
        ],
      };

      labelDefinitions.push(labelValueDefinition);

      parent = {
        uri: post.uri,
        cid: post.cid,
      };
    }
  }

  await setLabelerLabelDefinitions(loginCredentials, labelDefinitions);
};

await prepareDatabase(server);
