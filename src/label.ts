import { AppBskyActorDefs, ComAtprotoLabelDefs } from '@atproto/api';
import { DID, PORT, SIGNING_KEY, DELETE } from './constants.js';
import { LabelerServer } from '@skyware/labeler';
import { generateText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { createCanvas, loadImage } from 'canvas';
import { AtpAgent } from '@atproto/api';
import fs from 'node:fs/promises';
import 'dotenv/config';

const server = new LabelerServer({ did: DID, signingKey: SIGNING_KEY });

server.start(PORT, (error, address) => {
  if (error) {
    console.error(error);
  } else {
    console.log(`Labeler server listening on ${address}`);
  }
});

const agent = new AtpAgent({
  service: process.env.BSKY_SERVICE ?? 'https://bsky.social',
});

await agent.login({
  identifier: process.env.BSKY_IDENTIFIER!,
  password: process.env.BSKY_PASSWORD!,
});

console.log('Logged in to Bluesky');

export const label = async (subject: string | AppBskyActorDefs.ProfileView, rkey: string) => {
  const did = AppBskyActorDefs.isProfileView(subject) ? subject.did : subject;

  console.log(`Processing label for ${did}`);

  const query = server.db.prepare<unknown[], ComAtprotoLabelDefs.Label>(`SELECT * FROM labels WHERE uri = ?`).all(did);

  const labels = query.reduce((set, label) => {
    if (!label.neg) set.add(label.val);
    else set.delete(label.val);
    return set;
  }, new Set<string>());

  if (rkey.includes(DELETE)) {
    await handleDeleteLabels(did, labels);
  } else if (labels.size === 0) {
    await handleAddLabel(did);
  } else {
    console.log(`${did} already has a label. No action taken.`);
  }
};

async function canPerformLabelOperation(did: string): Promise<boolean> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const query = server.db
    .prepare<unknown[], { count: number }>(`SELECT COUNT(*) as count FROM labels WHERE uri = ? AND cts > ?`)
    .get(did, thirtyDaysAgo.toISOString())!;

  return query.count < 2;
  // return true;
}

async function handleDeleteLabels(did: string, labels: Set<string>) {
  try {
    if (labels.size > 0 && (await canPerformLabelOperation(did))) {
      await server.createLabels({ uri: did }, { negate: [...labels] });
      console.log(`Deleted labels for ${did}`);
    } else if (labels.size === 0) {
      console.log(`No labels to delete for ${did}`);
    } else {
      console.log('THIS SHOULD NOT HAPPEN!!');
      console.log(`Cannot delete labels for ${did}: 30-day limit reached`);
    }
  } catch (err) {
    console.error(`Error deleting labels for ${did}:`, err);
  }
}

async function handleAddLabel(did: string) {
  try {
    if (!(await canPerformLabelOperation(did))) {
      console.log(`Cannot add label for ${did}: 30-day limit reached`);
      return;
    }

    const { data } = await agent.getProfile({ actor: did });
    if (!data) {
      console.log('OOPS: Profile not found and/or we could not fetch it');
      return;
    }

    const avatar = await prepareAvatar(data);
    const prompt = createPrompt(data);

    await generateText({
      model: openai('gpt-4o'),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image',
              image: avatar.toBuffer(),
              experimental_providerMetadata: { openai: { imageDetail: 'low' } },
            },
          ],
        },
      ],
      toolChoice: 'required',
      tools: {
        decide: tool({
          parameters: z.object({
            answer: z.union([
              z.literal('gryffindor'),
              z.literal('hufflepuff'),
              z.literal('ravenclaw'),
              z.literal('slytherin'),
            ]),
          }),
          execute: async ({ answer }) => {
            await server.createLabel({ uri: did, val: answer });
            console.log(`Labeled ${did} with ${answer}`);
          },
        }),
      },
    });
  } catch (err) {
    console.error(`Error adding label for ${did}:`, err);
  }
}

async function prepareAvatar(subject: AppBskyActorDefs.ProfileView) {
  const size = 100;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  if (subject.avatar) {
    const image = await loadImage(subject.avatar);
    ctx.drawImage(image, 0, 0, size, size);
  } else {
    console.log('No avatar found, using 1x1 white pixel');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 1, 1);
  }

  const avatar = `avatars/${subject.did}.png`;
  await fs.writeFile(avatar, canvas.toBuffer());

  return canvas;
}

function createPrompt(subject: AppBskyActorDefs.ProfileView) {
  return `
You're the Sorting Hat from Harry Potter. Which house does the user with the profile data at the end of this message belong to?

Focus on the available information. If the avatar is not available, a 1x1 pixel white image is provided instead as a placeholder. Disregard the placeholder and focus on the user's data.
Always return an answer — house name only, all lowercase.
The user's data may be in any language. Focus on the meaning, not just the surface content.
Consider traits for all houses, not just intellect. 
You're strongly mischievous and enjoy sorting based on whims, not always strictly following the user's traits; imagine as if you're a person who likes to play tricks on people.

The user's data is as follows:

Name: ${subject.displayName || subject.handle} (@${subject.handle})
Bio: ${subject.description || 'User has no bio.'}
`;
}
